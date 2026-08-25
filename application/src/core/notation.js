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

  // Build the notes/voice for every group first so we can measure how
  // much horizontal space each one actually needs before laying out
  // staves. A fixed stave width per group let the formatter overflow
  // past its column whenever a group had many notes or wide
  // (accidental-heavy) notes — that overflow pushed into the next
  // stave and made its barline appear to cut through still-visible
  // notes from the previous group.
  const groups = chunk(notes, NOTES_PER_STAVE)
  const staveInfos = groups.map((group, gi) => {
    const vfNotes = group.map((n, ni) => {
      const key = midiToVexKey(n.midi)
      const sn = new StaveNote({
        keys: [key],
        duration: ticksToDuration(n.durationTicks, ppq)
      })
      if (key.includes('#')) sn.addModifier(new Accidental('#'), 0)
      if (gi * NOTES_PER_STAVE + ni === activeIndex) {
        sn.setStyle({ fillStyle: '#5ac8a8', strokeStyle: '#5ac8a8' })
      }
      return sn
    })

    const voice = new Voice({ num_beats: vfNotes.length, beat_value: 4 }).setStrict(false)
    voice.addTickables(vfNotes)

    const formatter = new Formatter().joinVoices([voice])
    const minWidth = formatter.preCalculateMinTotalWidth([voice])
    const width = Math.max(MIN_STAVE_WIDTH, minWidth + STAVE_PADDING)

    return { vfNotes, voice, formatter, width }
  })

  const totalWidth = staveInfos.reduce((sum, { width }) => sum + width, 0) + 20

  const renderer = new Renderer(container, Renderer.Backends.SVG)
  renderer.resize(totalWidth, 140)
  const context = renderer.getContext()

  const noteX = []
  let x = 10
  staveInfos.forEach(({ vfNotes, voice, formatter, width }, gi) => {
    const stave = new Stave(x, 20, width)
    if (gi === 0) stave.addClef('treble')
    stave.setContext(context).draw()

    formatter.format([voice], width - 30)
    voice.draw(context, stave)

    vfNotes.forEach((sn) => noteX.push(sn.getAbsoluteX()))

    x += width
  })

  return { noteInfo, noteX }
}
