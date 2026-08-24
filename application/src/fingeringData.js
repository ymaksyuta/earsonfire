// Simplified Boehm-system Bb clarinet fingering reference (written pitch,
// treble clef — no transposition is applied).
//
// The chalumeau register (E3-Bb4, MIDI 52-70) is hand-authored below.
// The clarion register (B4 and up) is *derived*, not hand-authored: on a
// real Boehm clarinet, opening the register key overblows a note a
// twelfth (19 semitones) higher using the same finger pattern as the
// chalumeau note a twelfth below. Reusing that relationship here means
// the two registers can't drift out of sync with each other.
//
// This is a beginner-level reference covering one standard fingering per
// note, not the full alternate-fingering chart. Cross-check against
// ref/clarinet_fingering.pdf before relying on it for real practice —
// entries the author is least confident about are flagged with
// confidence: 'approximate' so the UI can surface that.

export const HOLE_ORDER = ['L1', 'L2', 'L3', 'R1', 'R2', 'R3']

export const PINKY_KEYS = ['lowEb', 'lowFsharp', 'lowF', 'lowE', 'sideKey']

const KEY_LABELS = {
  lowE: 'E/B key (right pinky)',
  lowF: 'F/C key (right pinky)',
  lowFsharp: 'F#/C# key (right pinky)',
  lowEb: 'Ab/Eb key (left pinky)',
  sideKey: 'side key',
  register: 'register key',
}

// Chalumeau register, keyed by MIDI note number 52 (E3) .. 70 (Bb4).
const CHALUMEAU = {
  52: { holes: { L1: 1, L2: 1, L3: 1, R1: 1, R2: 1, R3: 1 }, keys: ['lowE'] },
  53: { holes: { L1: 1, L2: 1, L3: 1, R1: 1, R2: 1, R3: 1 }, keys: ['lowF'] },
  54: { holes: { L1: 1, L2: 1, L3: 1, R1: 1, R2: 1, R3: 1 }, keys: ['lowFsharp'] },
  55: { holes: { L1: 1, L2: 1, L3: 1, R1: 1, R2: 1, R3: 1 }, keys: [] },
  56: { holes: { L1: 1, L2: 1, L3: 1, R1: 1, R2: 1, R3: 1 }, keys: ['lowEb'] },
  57: { holes: { L1: 1, L2: 1, L3: 1, R1: 1, R2: 1, R3: 0 }, keys: [] },
  58: { holes: { L1: 1, L2: 1, L3: 1, R1: 1, R2: 0, R3: 0 }, keys: ['lowEb'] },
  59: { holes: { L1: 1, L2: 1, L3: 1, R1: 0, R2: 0, R3: 0 }, keys: [] },
  60: { holes: { L1: 1, L2: 1, L3: 0, R1: 0, R2: 0, R3: 0 }, keys: [] },
  61: { holes: { L1: 1, L2: 0, L3: 0, R1: 0, R2: 0, R3: 0 }, keys: ['lowEb'] },
  62: { holes: { L1: 1, L2: 0, L3: 0, R1: 0, R2: 0, R3: 0 }, keys: [] },
  63: { holes: { L1: 0, L2: 0, L3: 0, R1: 0, R2: 0, R3: 0 }, keys: ['lowEb'] },
  64: { holes: { L1: 0, L2: 0, L3: 0, R1: 0, R2: 0, R3: 0 }, keys: [] },
  65: {
    holes: { L1: 0, L2: 0, L3: 0, R1: 0, R2: 0, R3: 0 },
    keys: ['lowEb'],
    confidence: 'approximate',
  },
  66: {
    holes: { L1: 1, L2: 0, L3: 0, R1: 0, R2: 0, R3: 0 },
    keys: [],
    confidence: 'approximate',
  },
  67: { holes: { L1: 0, L2: 0, L3: 0, R1: 0, R2: 0, R3: 0 }, keys: [] },
  68: { holes: { L1: 0, L2: 0, L3: 0, R1: 0, R2: 0, R3: 0 }, keys: ['lowEb'] },
  69: { holes: { L1: 0, L2: 0, L3: 0, R1: 0, R2: 0, R3: 0 }, keys: ['register'] },
  70: {
    holes: { L1: 0, L2: 0, L3: 0, R1: 0, R2: 0, R3: 0 },
    keys: ['register', 'sideKey'],
    confidence: 'approximate',
  },
}

const CHALUMEAU_MIN = 52
const CHALUMEAU_MAX = 70
const CLARION_INTERVAL = 19 // a twelfth, in semitones

const NOTE_LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function noteName(midi) {
  const letter = NOTE_LETTERS[((midi % 12) + 12) % 12]
  const octave = Math.floor(midi / 12) - 1
  return `${letter}${octave}`
}

export function keyLabel(key) {
  return KEY_LABELS[key] || key
}

// Returns { midi, note, thumb, register, holes, keys, confidence? } or null
// if there's no reference fingering for this note.
export function getClarinetFingering(midi) {
  if (midi >= CHALUMEAU_MIN && midi <= CHALUMEAU_MAX) {
    const base = CHALUMEAU[midi]
    if (!base) return null
    return {
      midi,
      note: noteName(midi),
      thumb: true,
      register: base.keys.includes('register'),
      holes: base.holes,
      keys: base.keys,
      confidence: base.confidence,
    }
  }

  const chalumeauEquivalent = midi - CLARION_INTERVAL
  if (chalumeauEquivalent >= CHALUMEAU_MIN && chalumeauEquivalent <= CHALUMEAU_MAX) {
    const base = CHALUMEAU[chalumeauEquivalent]
    if (!base) return null
    const keys = base.keys.includes('register') ? base.keys : [...base.keys, 'register']
    return {
      midi,
      note: noteName(midi),
      thumb: true,
      register: true,
      holes: base.holes,
      keys,
      confidence: base.confidence,
    }
  }

  return null
}
