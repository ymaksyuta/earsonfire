// Registry of playable instruments. Each entry (other than the built-in
// 'none') implements a small, deliberately narrow interface so new
// instruments — recorder, calimba, guitar, piano, per dev/roadmap.txt —
// can be added without touching core/ or screens/:
//
//   id                  unique string, also used as the <select> value
//   label               display name
//   getFingering(midi)  -> fingering object | null; shape is instrument-defined
//   FingeringDiagram    React component: { label, fingering } -> JSX
//
// To add an instrument: create instruments/<name>/ with its own fingering
// data + diagram component, export an object matching the shape above
// (see instruments/clarinet/index.js), and add it to INSTRUMENTS below.

import clarinet from './clarinet'

export const NO_INSTRUMENT = { id: 'none', label: 'None' }

export const INSTRUMENTS = [NO_INSTRUMENT, clarinet]

export function getInstrument(id) {
  return INSTRUMENTS.find((inst) => inst.id === id) || NO_INSTRUMENT
}
