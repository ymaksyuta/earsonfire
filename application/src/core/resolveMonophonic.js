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
//   priority    tracks are ranked by their position in the track list
//               (see App.jsx's `trackOrder`, reorderable via the ▲▼
//               buttons in SelectionScreen); when two notes overlap,
//               the one from the higher-ranked (earlier in the list)
//               track wins — IMPLEMENTED.
//   none        no reduction at all — every overlapping note is kept,
//               i.e. real polyphony. notation.js detects this from the
//               `polyphonic` flag App.jsx derives from the strategy
//               (strategy === 'none') and renders one voice per source
//               track on a shared stave instead of a single continuous
//               line — see notation.js's "Polyphonic rendering" notes.
//               Fingering diagrams don't apply here (they assume one
//               active note at a time) and are hidden by TrainingScreen
//               whenever this strategy is selected.
//   autodetect  pick the harmonic "key note" of a simultaneous cluster
//               (e.g. a chord's root) — needs actual chord analysis.
//               NOT YET IMPLEMENTED — falls back to 'shorter' for now
//               (see below) so picking this option doesn't leave
//               unresolved overlaps in the output.
export const STRATEGIES = [
  {
    id: 'shorter',
    label: 'Shorter note wins',
    hint: 'When notes overlap, the shorter one is kept.'
  },
  {
    id: 'priority',
    label: 'Priority order',
    hint: 'When notes overlap, the voice higher in the list above wins.'
  },
  {
    id: 'none',
    label: 'Polyphonic (no reduction)',
    hint: 'Keeps every note — draws all voices together, no fingering.'
  },
  {
    id: 'autodetect',
    label: 'Auto-detect key note (coming soon)',
    hint: 'Not implemented yet — falls back to "Shorter note wins" for now.'
  }
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

// Builds an `isMoreSignificant` comparator for the 'priority' strategy.
// `priorityOrder` is an array of track indices (into the original
// tracks array — see combineTracks' sourceTrackIndex) ranked from
// highest to lowest priority, e.g. the track-list order maintained by
// App.jsx's `trackOrder`. A note from a track earlier in that array
// always beats one from a track later in it, regardless of duration.
// Tracks missing from `priorityOrder` (shouldn't normally happen — it
// should always contain every track — but guarded defensively) rank
// lowest of all, and a tie (two notes from the same track, or neither
// track found) keeps whichever note is already held.
function priorityWins(priorityOrder = []) {
  const rank = new Map(priorityOrder.map((trackIndex, i) => [trackIndex, i]))
  const rankOf = (trackIndex) => rank.has(trackIndex) ? rank.get(trackIndex) : Infinity

  return (challenger, held) => rankOf(challenger.sourceTrackIndex) < rankOf(held.sourceTrackIndex)
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

// `options.priorityOrder` (an array of track indices, highest priority
// first) is used by the 'priority' strategy — see priorityWins above.
export function resolveMonophonic(notes, strategy = DEFAULT_STRATEGY, options = {}) {
  if (notes.length <= 1) return notes

  switch (strategy) {
    case 'none':
      // No reduction — keep every overlapping note. Still just the
      // tick-sorted list combineTracks already produced.
      return notes
    case 'priority':
      return reduceGreedy(notes, priorityWins(options.priorityOrder))
    case 'autodetect': // TODO: real chord/key-note analysis
    case 'shorter':
    default:
      return reduceGreedy(notes, shorterWins)
  }
}
