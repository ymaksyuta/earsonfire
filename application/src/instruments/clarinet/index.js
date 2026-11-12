import { getClarinetFingering, getClarinetFingerings } from './fingeringData'
import FingeringDiagram from './FingeringDiagram'

// Clarinet (Bb), Boehm system. See fingeringData.js for note-range
// coverage and confidence caveats. This object is the whole contract
// with the rest of the app — see instruments/index.js for the shape.
const clarinet = {
  id: 'clarinet',
  label: 'Clarinet (Bb)',
  getFingering: getClarinetFingering,
  getFingerings: getClarinetFingerings,
  FingeringDiagram,
}

export default clarinet
