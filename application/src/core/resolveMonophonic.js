// Reduces a note list that may contain overlapping ("simultaneous")
// notes — the natural result of combining several tracks (see
// combineTracks.js) — down to a single monophonic stream, picking
// exactly one note out of any overlapping cluster per the chosen
// strategy. This stands in for real polyphony/chord support, which is
// future work (tracked as an instrument property or a user checkbox,
// per dev/notes.txt); for now every instrument is assumed monophonic,
// so only one note can ever be "sounding" at a time.
//
// Strategies, for the selector in SelectionScreen:
//   shorter     the shorter of two overlapping notes is the more
//               significant one (e.g. a quick melodic passing note
//               over a held pad chord) — IMPLEMENTED.
//   primary     one selected track is designated "primary"; its notes
//               always win when they overlap another track's note.
//               NOT YET IMPLEMENTED — falls back to 'shorter' for now
//               (see below) so picking this option doesn't leave
//               unresolved overlaps in the output.
//   autodetect  pick the harmonic "key note" of a simultaneous cluster
//               (e.g. a chord's root) — needs actual chord analysis.
//               NOT YET IMPLEMENTED — same 'shorter' fallback.
export const STRATEGIES = [
  { id: 'shorter', label: 'Shorter note wins' },
  { id: 'primary', label: 'Primary voice (coming soon)' },
  { id: 'autodetect', label: 'Auto-detect key note (coming soon)' }
]

export const DEFAULT_STRATEGY = 'shorter'

function overlaps(held, next) {
  return next.ticks < held.ticks + held.durationTicks
}

// True if `challenger` should replace `held` as the note carrying the
// voice forward.
function shorterWins(challenger, held) {
  return challenger.durationTicks < held.durationTicks
}

// Walks the (already tick-sorted) notes once, keeping a single "held"
// note at a time. Any subsequent note that overlaps it is a conflict:
// `isMoreSignificant(challenger, held)` decides whether the challenger
// takes over (the loser is dropped entirely, not truncated). A note
// that doesn't overlap the held one flushes it and becomes the new
// held note. This naturally resolves chains of more than two mutually
// overlapping notes, not just simple pairs, since `held` keeps getting
// re-challenged by each new arrival within the same overlapping run.
function reduceGreedy(notes, isMoreSignificant) {
  const out = []
  let held = null

  for (const n of notes) {
    if (held && overlaps(held, n)) {
      if (isMoreSignificant(n, held)) held = n
      // else: n is less significant than the held note and is dropped.
    } else {
      if (held) out.push(held)
      held = n
    }
  }
  if (held) out.push(held)

  return out
}

// `options.primaryTrackIndex` is accepted (an index into the original
// tracks array — see combineTracks' sourceTrackIndex) so the 'primary'
// strategy can be wired up later without another signature change; it
// isn't used yet since that strategy falls back to 'shorter'.
export function resolveMonophonic(notes, strategy = DEFAULT_STRATEGY, options = {}) {
  if (notes.length <= 1) return notes

  switch (strategy) {
    case 'primary': // TODO: use options.primaryTrackIndex once implemented
    case 'autodetect': // TODO: real chord/key-note analysis
    case 'shorter':
    default:
      return reduceGreedy(notes, shorterWins)
  }
}
