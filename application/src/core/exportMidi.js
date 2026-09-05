import { Midi } from '@tonejs/midi'

// Builds a standalone MIDI file from whatever's currently loaded into
// training — i.e. `track` as produced by App.jsx (combineTracks piped
// through resolveMonophonic; see dev/notes.txt), not the original
// per-instrument tracks from the source file.
//
// Notes are added by `time`/`duration` (seconds), not `ticks`, so this
// deliberately sidesteps ppq entirely: a fresh `new Midi()` defaults
// its header to 480 ppq regardless of the source file's actual ppq,
// and Track#addNote's tick-based path would silently misplace notes
// under any other ppq. `time`/`duration` are exact regardless of what
// ppq the exported file ends up using internally.
export function trackToMidi(track) {
  const midi = new Midi()
  const out = midi.addTrack()
  out.name = track.name || 'Track'

  for (const n of track.notes) {
    out.addNote({
      midi: n.midi,
      time: n.time,
      // A duration of exactly 0 is a valid (if silent) event in some
      // players but renders as an invisible/zero-length note in
      // others; floor it to something audible/visible.
      duration: Math.max(n.duration, 0.02),
      velocity: Math.min(Math.max(n.velocity ?? 0.8, 0), 1)
    })
  }

  return midi.toArray()
}

// Sanitizes a track name into a filesystem-safe .mid filename.
function midiFilename(name) {
  const base = (name || 'track')
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'track'
  return `${base}.mid`
}

// Triggers a browser download of `track` as a .mid file. No return
// value — this is a side-effecting "save as" action, not a pure
// function; see trackToMidi() for the part that's actually testable.
export function downloadTrackAsMidi(track) {
  const bytes = trackToMidi(track)
  const blob = new Blob([bytes], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = midiFilename(track.name)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    URL.revokeObjectURL(url)
  }
}
