// Small, instrument-agnostic helpers for turning MIDI note numbers into
// the representations different parts of the app need. Kept separate
// from notation.js/usePlayback.js so both can share them without
// depending on each other.

const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']

export function midiToVexKey(midiNum) {
  const name = NOTE_NAMES[midiNum % 12]
  const octave = Math.floor(midiNum / 12) - 1
  return `${name}/${octave}`
}

export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12)
}
