import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from 'vexflow'
import { midiToVexKey } from './midiNotes'
import { chunk } from './arrayUtils'

const MAX_NOTES_RENDERED = 64 // keep the demo fast/legible
const NOTES_PER_STAVE = 8
// Minimum width for a stave; groups that need more (many notes, lots of
// accidentals) get widened — see the width calculation below.
const MIN_STAVE_WIDTH = 260
// Extra room beyond VexFlow's own minimum width estimate, for the clef
// (first stave only) and breathing room around the barline.
const STAVE_PADDING = 40
// Gaps shorter than this (in quarter notes) are treated as note-off/
// note-on slop from articulation (staccato, detached playing) rather
// than an intentional rest, and are absorbed rather than drawn — a 32nd
// note's worth of silence.
const MIN_REST_QUARTERS = 0.125

function ticksToDuration(ticks, ppq) {
  const quarters = Math.max(ticks, 1) / ppq
  const table = [
    { q: 4, d: 'w' }, { q: 2, d: 'h' }, { q: 1, d: 'q' },
    { q: 0.5, d: '8' }, { q: 0.25, d: '16' }, { q: 0.125, d: '32' }
  ]
  let best = table[2]
  let bestDiff = Infinity
  for (const c of table) {
    const diff = Math.abs(Math.log2(c.q) - Math.log2(quarters))
    if (diff < bestDiff) { bestDiff = diff; best = c }
  }
  return best.d
}

// Turns a flat list of notes into a list of { type: 'note'|'rest', ... }
// items, inserting a rest wherever there's a real gap between the end of
// one note and the start of the next (or before the first note, for a
// pickup rest). Rests get their own duration snapped the same way note
// durations are — see ticksToDuration — so a long gap becomes one rest
// of the closest power-of-two length rather than several tied together;
// that's a simplification consistent with how note durations are
// already approximated here, not a measure-accurate rest breakdown.
function withRests(notes, ppq) {
  const items = []
  let prevEndTicks = 0
  let noteIndex = 0
  const minRestTicks = MIN_REST_QUARTERS * ppq

  for (const n of notes) {
    const gapTicks = n.ticks - prevEndTicks
    if (gapTicks >= minRestTicks) {
      items.push({ type: 'rest', durationTicks: gapTicks })
    }
    items.push({ type: 'note', note: n, noteIndex })
    noteIndex += 1
    prevEndTicks = n.ticks + n.durationTicks
  }

  return items
}

// Renders `track` into `container` as SVG via VexFlow, highlighting the
// note at `activeIndex`. Returns { noteInfo, noteX }: noteInfo is a
// human-readable "N notes" / "showing first N of M" string, and
// noteX[i] is the absolute x position of note i within the container,
// used by the caller to auto-scroll the active note into view.
export function renderScore(container, track, ppq, activeIndex = -1) {
  container.innerHTML = ''

  if (!track) return { noteInfo: '', noteX: [] }

  const notes = track.notes.slice(0, MAX_NOTES_RENDERED)
  const noteInfo = notes.length < track.notes.length
    ? `Showing first ${notes.length} of ${track.notes.length} notes.`
    : `${notes.length} notes.`

  if (notes.length === 0) {
    container.innerHTML = '<div class="empty">This track has no notes.</div>'
    return { noteInfo, noteX: [] }
  }

  // Interleave rests between notes before grouping into staves, so a
  // group's width calculation (below) accounts for the rest glyphs too.
  // Groups are chunked by item count (notes + rests together), so a
  // rest-heavy passage naturally fits fewer real notes per line than a
  // dense one — same fixed-width-per-line approach as before, just
  // counting rests as items alongside notes.
  const items = withRests(notes, ppq)

  // Build the notes/voice for every group first so we can measure how
  // much horizontal space each one actually needs before laying out
  // staves. A fixed stave width per group let the formatter overflow
  // past its column whenever a group had many notes or wide
  // (accidental-heavy) notes — that overflow pushed into the next
  // stave and made its barline appear to cut through still-visible
  // notes from the previous group.
  const groups = chunk(items, NOTES_PER_STAVE)
  const staveInfos = groups.map((group) => {
    const vfItems = group.map((item) => {
      if (item.type === 'rest') {
        return {
          item,
          sn: new StaveNote({
            keys: ['b/4'],
            duration: `${ticksToDuration(item.durationTicks, ppq)}r`
          })
        }
      }

      const key = midiToVexKey(item.note.midi)
      const sn = new StaveNote({
        keys: [key],
        duration: ticksToDuration(item.note.durationTicks, ppq)
      })
      if (key.includes('#')) sn.addModifier(new Accidental('#'), 0)
      if (item.noteIndex === activeIndex) {
        sn.setStyle({ fillStyle: '#5ac8a8', strokeStyle: '#5ac8a8' })
      }
      return { item, sn }
    })

    const vfNotes = vfItems.map(({ sn }) => sn)
    const voice = new Voice({ num_beats: vfNotes.length, beat_value: 4 }).setStrict(false)
    voice.addTickables(vfNotes)

    const formatter = new Formatter().joinVoices([voice])
    const minWidth = formatter.preCalculateMinTotalWidth([voice])
    // The width used to justify note spacing (below) must stay tied to
    // the content's own measured minimum, not the wider stave width —
    // when MIN_STAVE_WIDTH's floor kicks in for a sparse group, asking
    // the formatter to spread notes across that extra floor space
    // stretched inter-note spacing enough to push the trailing item's
    // glyph past the stave's right edge and into the next stave, which
    // for a rest (a fixed glyph at a fixed staff position, with no
    // note-to-note spacing logic of its own) showed up as a rest
    // appearing to sit on top of the barline. Unused floor space is
    // safe left as blank margin; stretched note spacing is not.
    const contentWidth = minWidth + 10
    const width = Math.max(MIN_STAVE_WIDTH, minWidth + STAVE_PADDING)

    return { vfItems, voice, formatter, contentWidth, width }
  })

  const totalWidth = staveInfos.reduce((sum, { width }) => sum + width, 0) + 20

  const renderer = new Renderer(container, Renderer.Backends.SVG)
  renderer.resize(totalWidth, 140)
  const context = renderer.getContext()

  // Indexed by note position (not item position) — rests never appear
  // here, since callers (auto-scroll, fingering lookup) only ever refer
  // to notes by their index into track.notes.
  const noteX = []
  let x = 10
  staveInfos.forEach(({ vfItems, voice, formatter, contentWidth, width }, gi) => {
    const stave = new Stave(x, 20, width)
    if (gi === 0) stave.addClef('treble')
    stave.setContext(context).draw()

    formatter.format([voice], contentWidth)
    voice.draw(context, stave)

    vfItems.forEach(({ item, sn }) => {
      if (item.type === 'note') noteX[item.noteIndex] = sn.getAbsoluteX()
    })

    x += width
  })

  return { noteInfo, noteX }
}
