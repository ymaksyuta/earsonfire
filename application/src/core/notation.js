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
// Stave height for a single continuous voice vs. several voices sharing
// one stave (polyphonic mode) — the extra room accommodates ledger
// lines/stems going both up and down at once.
const MONOPHONIC_STAVE_HEIGHT = 140
const POLYPHONIC_STAVE_HEIGHT = 170

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

// Turns one voice's flat list of { note, index } pairs (`index` being
// its position in the ORIGINAL track.notes array — see splitBySourceTrack
// below for why this is threaded through explicitly rather than reset
// to 0..N-1 per voice) into a list of { type: 'note'|'rest', ... } items,
// inserting rests wherever there's a real gap between the end of one
// note and the start of the next (or before the first note, for a
// pickup rest) — see pushRestSpan for how a gap spanning multiple
// measures gets split at the barlines rather than collapsed into one
// glyph.
//
// `padToTicks`, if given, additionally fills any trailing silence after
// this voice's last note out to that absolute tick — used in polyphonic
// mode so every voice's item stream (and therefore its groupByMeasure
// output) spans the same number of measures even when one voice's notes
// end earlier than another's; see renderPolyphonic below.
function withRests(indexedNotes, ppq, ticksPerMeasureVal, padToTicks = null) {
  const items = []
  let prevEndTicks = 0
  const minRestTicks = MIN_REST_QUARTERS * ppq

  for (const { note: n, index } of indexedNotes) {
    pushRestSpan(items, prevEndTicks, n.ticks, ppq, ticksPerMeasureVal, minRestTicks)
    items.push({ type: 'note', note: n, noteIndex: index, startTicks: n.ticks })
    prevEndTicks = n.ticks + n.durationTicks
  }

  if (padToTicks != null && padToTicks > prevEndTicks) {
    // minRestTicks 0 here: a trailing pad should always render (even a
    // short fringe), not get silently dropped as articulation noise —
    // there's no next note coming to make that ambiguity plausible.
    pushRestSpan(items, prevEndTicks, padToTicks, ppq, ticksPerMeasureVal, 0)
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

// Builds one VexFlow StaveNote per item (rest or note), tagging each
// with its source `item` so callers can read noteIndex/type back off
// afterward. `stemDirection` (1 up, -1 down, or omitted for the default
// single-voice case) distinguishes simultaneous voices sharing a stave.
function buildStaveNotes(group, ppq, activeIndex, stemDirection) {
  return group.map((item) => {
    if (item.type === 'rest') {
      const duration = item.wholeMeasure ? 'w' : ticksToDuration(item.durationTicks, ppq)
      const sn = new StaveNote({ keys: ['b/4'], duration: `${duration}r` })
      if (stemDirection) sn.setStemDirection(stemDirection)
      return { item, sn }
    }

    const key = midiToVexKey(item.note.midi)
    const sn = new StaveNote({
      keys: [key],
      duration: ticksToDuration(item.note.durationTicks, ppq)
    })
    if (stemDirection) sn.setStemDirection(stemDirection)
    if (key.includes('#')) sn.addModifier(new Accidental('#'), 0)
    if (item.noteIndex === activeIndex) {
      sn.setStyle({ fillStyle: '#5ac8a8', strokeStyle: '#5ac8a8' })
    }
    return { item, sn }
  })
}

// Wraps a group of StaveNotes into a VexFlow Voice declared at the
// track's actual time signature — e.g. [4, 4] -> num_beats 4,
// beat_value 4 — NOT derived from vfNotes.length. This matters
// specifically for joined (polyphonic) rendering: Voice.getTotalTicks()
// is computed purely from this declared {num_beats, beat_value}, never
// from the tickables actually added, so Formatter.joinVoices' cross-
// voice TickMismatch check compares these declared values — two voices
// for the same measure that happen to contain a different number of
// items (because one has more/shorter notes than the other) would
// otherwise be declared as having different total ticks and fail to
// join even though they both really do span one measure. Declaring the
// same real time signature for every voice keeps that check meaningful
// (a genuine mismatch, if the padding logic above has a bug, still
// throws) while making the common case — same measure, different note
// counts per voice — always agree. setStrict(false) separately relaxes
// each voice's own internal fill-check against quantization rounding
// (ticksToDuration snaps to the nearest power-of-two, so a group's
// tickables don't always sum to exactly one measure either).
function buildVoice(vfNotes, timeSignature) {
  const [numerator, denominator] = timeSignature
  const voice = new Voice({ num_beats: numerator, beat_value: denominator }).setStrict(false)
  voice.addTickables(vfNotes)
  return voice
}

// Wires up tap-to-select: every rendered note (not rests — there's
// nothing to select) gets a click handler on its own SVG element,
// calling onNoteClick(item.noteIndex) — the index into track.notes,
// same one activeIndex/noteX are keyed by, so a tap can drive the same
// cursor a Play/step action would. Must run after voice.draw(), since
// getSVGElement() only returns something once the note has actually
// been drawn into the DOM.
function attachClickHandlers(vfItems, onNoteClick) {
  if (!onNoteClick) return
  vfItems.forEach(({ item, sn }) => {
    if (item.type !== 'note') return
    const el = sn.getSVGElement()
    if (!el) return
    el.style.cursor = 'pointer'
    el.addEventListener('click', () => onNoteClick(item.noteIndex))
  })
}

// Splits `notes` (already carrying `sourceTrackIndex` — see
// combineTracks.js) into one array per source track, each entry kept as
// { note, index } so the original position in `notes` (used everywhere
// else — activeIndex, noteX, tap-to-select) survives the split. Voices
// come back ordered by ascending sourceTrackIndex (i.e. the order
// tracks appear in the source file) for a stable, deterministic
// top-to-bottom stacking — deliberately not App.jsx's `trackOrder`,
// since that's a priority ranking for monophonic reduction and has no
// bearing on how multiple simultaneous voices should be stacked.
function splitBySourceTrack(notes) {
  const bySource = new Map()
  notes.forEach((note, index) => {
    const key = note.sourceTrackIndex
    if (!bySource.has(key)) bySource.set(key, [])
    bySource.get(key).push({ note, index })
  })
  return [...bySource.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, indexedNotes]) => indexedNotes)
}

// Renders `track` into `container` as SVG via VexFlow, highlighting the
// note at `activeIndex`. `timeSignature` is a [numerator, denominator]
// pair used to lay out one musical measure per stave (see
// groupByMeasure) — pass [4, 4] if the source has none.
// `opts.polyphonic` switches to multi-voice rendering (see
// renderPolyphonic below) instead of one continuous line; `opts.onNoteClick`
// wires up tap-to-select on every rendered note (see attachClickHandlers).
// Returns { noteInfo, noteX }: noteInfo is a human-readable "N notes"
// string, and noteX[i] is the absolute x position of note i within the
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
export function renderScore(container, track, ppq, timeSignature, activeIndex = -1, opts = {}) {
  container.innerHTML = ''

  if (!track) return { noteInfo: '', noteX: [] }

  const notes = track.notes
  const noteInfo = `${notes.length} notes.`

  if (notes.length === 0) {
    container.innerHTML = '<div class="empty">This track has no notes.</div>'
    return { noteInfo, noteX: [] }
  }

  const measureTicks = ticksPerMeasure(timeSignature, ppq)

  return opts.polyphonic
    ? renderPolyphonic(container, notes, ppq, timeSignature, measureTicks, activeIndex, opts.onNoteClick, noteInfo)
    : renderSingleVoice(container, notes, ppq, timeSignature, measureTicks, activeIndex, opts.onNoteClick, noteInfo)
}

// The original single-continuous-voice rendering path, used whenever
// `track.notes` has already been reduced to one note at a time (every
// resolveMonophonic strategy except 'none') — see renderPolyphonic for
// the multi-voice alternative.
function renderSingleVoice(container, notes, ppq, timeSignature, measureTicks, activeIndex, onNoteClick, noteInfo) {
  const indexedNotes = notes.map((note, index) => ({ note, index }))

  // Interleave rests between notes, split at measure boundaries, then
  // group into one measure per stave — see groupByMeasure and
  // pushRestSpan above.
  const items = withRests(indexedNotes, ppq, measureTicks)

  // Build the notes/voice for every group first so we can measure how
  // much horizontal space each one actually needs before laying out
  // staves. A fixed stave width per group let the formatter overflow
  // past its column whenever a group had many notes or wide
  // (accidental-heavy) notes — that overflow pushed into the next
  // stave and made its barline appear to cut through still-visible
  // notes from the previous group.
  const groups = groupByMeasure(items, measureTicks)
  const staveInfos = groups.map((group) => {
    const vfItems = buildStaveNotes(group, ppq, activeIndex)
    const voice = buildVoice(vfItems.map(({ sn }) => sn), timeSignature)

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

    return { voices: [voice], vfItemGroups: [vfItems], formatter, contentWidth, width }
  })

  return drawStaves(container, staveInfos, MONOPHONIC_STAVE_HEIGHT, onNoteClick, noteInfo)
}

// Multi-voice rendering for the 'none' (no reduction) strategy: one
// VexFlow Voice per source track, all sharing the same stave per
// measure via Formatter.joinVoices. Two notes that genuinely start at
// the same musical instant land in the same TickContext and are
// therefore drawn at the same x position "for free" — that's just how
// VexFlow's tick-based alignment works once every voice's rests are
// filled in accurately, no separate left-alignment step needed. See
// dev/notes.txt's "Polyphonic rendering" section for the full writeup,
// including the caveat that ticksToDuration's power-of-two rounding can
// still make voices drift apart in extended, rhythmically-dense runs
// within a measure — an existing approximation this shares with the
// single-voice path, just more visible with more than one voice.
function renderPolyphonic(container, notes, ppq, timeSignature, measureTicks, activeIndex, onNoteClick, noteInfo) {
  const parts = splitBySourceTrack(notes)

  // Every voice needs to span the same number of measures so measure
  // index N in one voice lines up with measure index N in another (see
  // withRests' padToTicks) — otherwise a voice whose notes end early
  // would simply run out of groups partway through the piece instead of
  // showing trailing rests alongside the other voices' continuing notes.
  const lastEndTicks = notes.reduce((max, n) => Math.max(max, n.ticks + n.durationTicks), 0)
  const overallEndTicks = Math.ceil(lastEndTicks / measureTicks) * measureTicks

  const partGroups = parts.map((indexedNotes) => {
    const items = withRests(indexedNotes, ppq, measureTicks, overallEndTicks)
    return groupByMeasure(items, measureTicks)
  })
  const measureCount = Math.max(...partGroups.map((g) => g.length), 0)

  const staveInfos = []
  for (let mi = 0; mi < measureCount; mi++) {
    const voices = []
    const vfItemGroups = []

    partGroups.forEach((groups, partIdx) => {
      const group = groups[mi]
      if (!group || group.length === 0) return
      // More than one voice on a stave needs opposing stems to read as
      // separate parts rather than one confused line; alternate by
      // voice position (top voice up, next down, and so on) — the
      // usual convention for >2 simultaneous parts on one staff still
      // gets crowded, but this is at least readable for the common
      // 2-3 selected tracks case.
      const stemDirection = parts.length > 1 ? (partIdx % 2 === 0 ? 1 : -1) : undefined
      const vfItems = buildStaveNotes(group, ppq, activeIndex, stemDirection)
      const voice = buildVoice(vfItems.map(({ sn }) => sn), timeSignature)
      voices.push(voice)
      vfItemGroups.push(vfItems)
    })

    if (voices.length === 0) continue

    const formatter = new Formatter().joinVoices(voices)
    const minWidth = formatter.preCalculateMinTotalWidth(voices)
    const contentWidth = minWidth + 10
    const width = Math.max(MIN_STAVE_WIDTH, minWidth + STAVE_PADDING)

    staveInfos.push({ voices, vfItemGroups, formatter, contentWidth, width })
  }

  return drawStaves(container, staveInfos, POLYPHONIC_STAVE_HEIGHT, onNoteClick, noteInfo)
}

// Shared final pass for both rendering paths: lays out staves left to
// right, draws each one's voice(s), attaches tap-to-select handlers,
// and records every note's absolute x position for auto-scroll.
function drawStaves(container, staveInfos, staveHeight, onNoteClick, noteInfo) {
  const totalWidth = staveInfos.reduce((sum, { width }) => sum + width, 0) + 20

  const renderer = new Renderer(container, Renderer.Backends.SVG)
  renderer.resize(Math.max(totalWidth, MIN_STAVE_WIDTH + 20), staveHeight)
  const context = renderer.getContext()

  // Indexed by note position in track.notes (not item position) —
  // rests never appear here, since callers (auto-scroll, fingering
  // lookup) only ever refer to notes by their index into track.notes.
  const noteX = []
  let x = 10
  staveInfos.forEach(({ voices, vfItemGroups, formatter, contentWidth, width }, gi) => {
    const stave = new Stave(x, 20, width)
    if (gi === 0) stave.addClef('treble')
    stave.setContext(context).draw()

    formatter.format(voices, contentWidth)
    voices.forEach((voice) => voice.draw(context, stave))

    vfItemGroups.forEach((vfItems) => {
      attachClickHandlers(vfItems, onNoteClick)
      vfItems.forEach(({ item, sn }) => {
        if (item.type === 'note') noteX[item.noteIndex] = sn.getAbsoluteX()
      })
    })

    x += width
  })

  return { noteInfo, noteX }
}
