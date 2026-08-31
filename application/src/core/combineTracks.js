// Merges the notes of several tracks into one, so the rest of the app
// (usePlayback, renderScore, the fingering diagram) can keep treating
// "what's selected" as a single track with a single note list, same as
// before multi-track selection existed.
//
// Simultaneous notes across the selected tracks are NOT combined into a
// chord — every note stays its own separate event, the merged list is
// only sorted by start tick. Two notes that start at the same tick
// (e.g. two tracks doubling a phrase, or genuinely simultaneous
// content) will simply sit next to each other in that order and get
// notated/played as consecutive notes, not stacked as one chord glyph.
// That's a deliberate simplification for now — proper chord detection
// and rendering is a separate, later piece of work.
export function combineTracks(tracks, indices) {
  const selected = indices
    .slice()
    .sort((a, b) => a - b)
    .map((i) => tracks[i])
    .filter(Boolean)

  const notes = selected
    .flatMap((t) => t.notes)
    .slice()
    .sort((a, b) => a.ticks - b.ticks)

  const name = selected.length === 0
    ? ''
    : selected.map((t) => t.name || 'Track').join(' + ')

  return { notes, name }
}
