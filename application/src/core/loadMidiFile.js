import { Midi } from '@tonejs/midi'

// MIDI text events are C-strings under the hood, so @tonejs/midi track
// names sometimes carry a trailing NUL (and occasionally other control
// bytes) from the source file — strip those before ever displaying a
// name.
function cleanTrackName(raw) {
  return (raw || '').replace(/[\x00-\x1f]+$/, '').trim()
}

// Some sequencers (this is common in older Cakewalk/Band-in-a-Box-style
// exports) put a track's instrument name on its own otherwise-empty
// track immediately preceding the track that actually holds its notes,
// rather than naming the note-bearing track itself. When a note-bearing
// track has no name of its own, walk backward over any empty tracks in
// between and borrow the name from the nearest preceding named one —
// stopping early if we hit another track that already has notes, so we
// never attribute a name across an instrument boundary.
function resolveTrackName(allTracks, index) {
  const own = cleanTrackName(allTracks[index].name)
  if (own) return own

  for (let i = index - 1; i >= 0; i -= 1) {
    const t = allTracks[i]
    if (t.notes.length > 0) break
    const name = cleanTrackName(t.name)
    if (name) return name
  }

  return ''
}

// Parses an uploaded file into { tracks, ppq }. `tracks` only includes
// tracks that actually contain notes — VexFlow has nothing to draw for
// an empty track, and empty tracks are usually markers/tempo tracks
// rather than music. Returns an empty `tracks` array (not an error) when
// nothing playable is found; callers decide how to message that, since
// "no notes in this file" isn't a parse failure the way a corrupt file is.
export async function parseMidiFile(file) {
  const buf = await file.arrayBuffer()
  const midi = new Midi(buf)
  midi.tracks.forEach((t, i) => { t.name = resolveTrackName(midi.tracks, i) })
  const tracks = midi.tracks.filter((t) => t.notes.length > 0)
  return { tracks, ppq: midi.header.ppq }
}
