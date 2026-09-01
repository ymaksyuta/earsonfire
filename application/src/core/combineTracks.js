// Merges the notes of several tracks into one, so the rest of the app
// (usePlayback, renderScore, the fingering diagram) can keep treating
// "what's selected" as a single track with a single note list, same as
// before multi-track selection existed.
//
// Simultaneous notes across the selected tracks are NOT combined into a
// chord here — every note stays its own separate event, the merged
// list is only sorted by start tick. Two notes that start at the same
// tick, or otherwise overlap in time, simply sit next to each other in
// this merged list; resolving that overlap down to one note (since the
// instrument is assumed monophonic for now) is a separate step — see
// resolveMonophonic.js — deliberately kept out of this function so
// combineTracks stays a pure "merge" with no notion of which note wins.
//
// Each note gets a non-enumerable-in-spirit but perfectly ordinary
// `sourceTrackIndex` field (the index into the original `tracks` array
// passed in, not the position within the selection) attached, so a
// later step — e.g. the "primary voice" resolution strategy — can tell
// which track a given note came from without re-deriving it.
export function combineTracks(tracks, indices) {
  const selected = indices
    .slice()
    .sort((a, b) => a - b)
    .map((i) => ({ index: i, track: tracks[i] }))
    .filter(({ track }) => Boolean(track))

  const notes = selected
    .flatMap(({ index, track }) => track.notes.map((n) => ({ ...n, sourceTrackIndex: index })))
    .sort((a, b) => a.ticks - b.ticks)

  const name = selected.length === 0
    ? ''
    : selected.map(({ track }) => track.name || 'Track').join(' + ')

  return { notes, name }
}
