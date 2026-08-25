import { Midi } from '@tonejs/midi'

// Parses an uploaded file into { tracks, ppq }. `tracks` only includes
// tracks that actually contain notes — VexFlow has nothing to draw for
// an empty track, and empty tracks are usually markers/tempo tracks
// rather than music. Returns an empty `tracks` array (not an error) when
// nothing playable is found; callers decide how to message that, since
// "no notes in this file" isn't a parse failure the way a corrupt file is.
export async function parseMidiFile(file) {
  const buf = await file.arrayBuffer()
  const midi = new Midi(buf)
  const tracks = midi.tracks.filter((t) => t.notes.length > 0)
  return { tracks, ppq: midi.header.ppq }
}
