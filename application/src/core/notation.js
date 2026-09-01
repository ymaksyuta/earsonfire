import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from 'vexflow'
import { midiToVexKey } from './midiNotes'

// Minimum width for a stave; groups that need more (many notes, lots of
// accidentals) get widened — see the width calculation below.
const MIN_STAVE_WIDTH = 260
// Extra room beyond VexFlow's own minimum width estimate, for the clef
// (first stave only) and breathing room around the barline.
const STAVE_PADDING = 40
// Gaps shorter than this (in quarter notes) are treated as note-off/
// note-on slop from articulation (staccato, detached playing) rather
// than an intentional rest, and are absorbed rather than drawn — a 32nd
// note's worth of silence. Only applies to the partial fringe of a rest
// within a measure; a fully empty measure always gets its whole-rest
// glyph regardless of size, since there's no jitter ambiguity there.
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

// One measure in ticks, from a [numerator, denominator] time signature —
// e.g. 4/4 at 480 ppq is 1920 ticks, 2/2 (cut time) is also 1920 (two
// half notes). Assumes a single time signature for the whole track; a
// piece with a mid-piece meter change would need this recomputed at
// each change point, which isn't handled here.
function ticksPerMeasure([numerator, denominator], ppq) {
  return ppq * numerator * (4 / denominator)
}

// Splits the silence from `startTicks` to `endTicks` into per-measure
// rest items, walking one measure at a time. A segment that exactly
// fills a whole measure (starts and ends on measure boundaries) is
// marked wholeMeasure so the caller renders it as a single whole rest —
// the standard notational convention for "this measure is empty"
// regardless of time signature, rather than whatever duration the raw
// tick count would otherwise snap to. A segment that only partially
// fills a measure (the fringe before/after a run of empty measures, or
// the entirety of a short gap that doesn't cross a barline) is snapped
// via ticksToDuration like a note, and is dropped if it's under the
// articulation-noise threshold.
function pushRestSpan(items, startTicks, endTicks, ppq, ticksPerMeasureVal, minRestTicks) {
  let cursor = startTicks
  while (cursor < endTicks) {
    const measureIndex = Math.floor(cursor / ticksPerMeasureVal)
    const measureStart = measureIndex * ticksPerMeasureVal
    const measureEnd = measureStart + ticksPerMeasureVal
    const segEnd = Math.min(endTicks, measureEnd)
    const segTicks = segEnd - cursor
    const wholeMeasure = cursor === measureStart && segEnd === measureEnd

    if (wholeMeasure) {
      items.push({ type: 'rest', startTicks: cursor, wholeMeasure: true })
    } else if (segTicks >= minRestTicks) {
      items.push({ type: 'rest', startTicks: cursor, durationTicks: segTicks })
    }

    cursor = segEnd
  }
}

// Turns a flat list of notes into a list of { type: 'note'|'rest', ... }
// items, inserting rests wherever there's a real gap between the end of
// one note and the start of the next (or before the first note, for a
// pickup rest) — see pushRestSpan for how a gap spanning multiple
// measures gets split at the barlines rather than collapsed into one
// glyph.
function withRests(notes, ppq, ticksPerMeasureVal) {
  const items = []
  let prevEndTicks = 0
  let noteIndex = 0
  const minRestTicks = MIN_REST_QUARTERS * ppq

  for (const n of notes) {
    pushRestSpan(items, prevEndTicks, n.ticks, ppq, ticksPerMeasureVal, minRestTicks)
    items.push({ type: 'note', note: n, noteIndex, startTicks: n.ticks })
    noteIndex += 1
    prevEndTicks = n.ticks + n.durationTicks
  }

  return items
}

// Groups items into one array per measure, based on each item's own
// start tick — an item is never split across this boundary (rests are
// already pre-split at measure lines by pushRestSpan; a note whose
// performed duration runs past the barline is grouped by where it
// starts, same simplification already used for note durations
// elsewhere in this file, not a tied-note breakdown).
function groupByMeasure(items, ticksPerMeasureVal) {
  const groups = []
  let current = []
  let currentMeasure = null

  for (const item of items) {
    const measureIndex = Math.floor(item.startTicks / ticksPerMeasureVal)
    if (currentMeasure !== null && measureIndex !== currentMeasure) {
      groups.push(current)
      current = []
    }
    currentMeasure = measureIndex
    current.push(item)
  }
  if (current.length > 0) groups.push(current)

  return groups
}

// Renders `track` into `container` as SVG via VexFlow, highlighting the
// note at `activeIndex`. `timeSignature` is a [numerator, denominator]
// pair used to lay out one musical measure per stave (see
// groupByMeasure) — pass [4, 4] if the source has none. Returns
// { noteInfo, noteX }: noteInfo is a human-readable "N notes" string,
// and noteX[i] is the absolute x position of note i within the
// container, used by the caller to auto-scroll the active note into
// view.
//
// Renders every note in the track — there is no length cap. A long
// track produces a wide SVG (the score is one continuous horizontally-
// scrolled reel, not paginated — see dev/notes.txt), which is fine for
// SVG's own limits, but render time scales with note count: ~1.5s for
// a real ~1700-note track in a quick benchmark. If that becomes a
// problem for very large files, the fix is virtualizing/paginating the
// render, not reintroducing a silent truncation — a partial score
// silently hides real material, which is worse than a slower one.
export function renderScore(container, track, ppq, timeSignature, activeIndex = -1) {
  container.innerHTML = ''

  if (!track) return { noteInfo: '', noteX: [] }

  const notes = track.notes
  const noteInfo = `${notes.length} notes.`

  if (notes.length === 0) {
    container.innerHTML = '<div class="empty">This track has no notes.</div>'
    return { noteInfo, noteX: [] }
  }

  const measureTicks = ticksPerMeasure(timeSignature, ppq)

  // Interleave rests between notes, split at measure boundaries, then
  // group into one measure per stave — see groupByMeasure and
  // pushRestSpan above.
  const items = withRests(notes, ppq, measureTicks)

  // Build the notes/voice for every group first so we can measure how
  // much horizontal space each one actually needs before laying out
  // staves. A fixed stave width per group let the formatter overflow
  // past its column whenever a group had many notes or wide
  // (accidental-heavy) notes — that overflow pushed into the next
  // stave and made its barline appear to cut through still-visible
  // notes from the previous group.
  const groups = groupByMeasure(items, measureTicks)
  const staveInfos = groups.map((group) => {
    const vfItems = group.map((item) => {
      if (item.type === 'rest') {
        const duration = item.wholeMeasure ? 'w' : ticksToDuration(item.durationTicks, ppq)
        return {
          item,
          sn: new StaveNote({ keys: ['b/4'], duration: `${duration}r` })
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
