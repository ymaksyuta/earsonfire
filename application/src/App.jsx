import { useMemo, useState } from 'react'
import { parseMidiFile } from './core/loadMidiFile'
import { combineTracks } from './core/combineTracks'
import SelectionScreen from './screens/SelectionScreen'
import TrainingScreen from './screens/TrainingScreen'

export default function App() {
  const [tracks, setTracks] = useState([])
  // Indices into `tracks`. Training plays/notates the selected tracks
  // as one merged voice — see core/combineTracks.js.
  const [selectedIndices, setSelectedIndices] = useState([])
  const [ppq, setPpq] = useState(480)
  // [numerator, denominator], e.g. [4, 4]. Used to lay out one musical
  // measure per stave — see notation.js.
  const [timeSignature, setTimeSignature] = useState([4, 4])
  const [status, setStatus] = useState('')
  const [error, setError] = useState(false)
  const [meta, setMeta] = useState('')
  const [instrument, setInstrument] = useState('none')
  // Playback speed multiplier: 1 = as written, <1 slower, >1 faster.
  // Owned here (not by TrainingScreen/usePlayback) since the slider is
  // meant to persist across pause/stop within a training session.
  const [tempo, setTempo] = useState(1)
  // 'selection' (file/track/instrument setup) or 'training' (score +
  // playback + fingering). Splitting these into separate screens keeps
  // each one uncluttered on a phone-sized viewport instead of stacking
  // every control and the whole score in one scroll — see dev/notes.txt.
  const [screen, setScreen] = useState('selection')

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setStatus(`Parsing ${file.name} …`)
    setError(false)

    try {
      const { tracks: withNotes, ppq: filePpq, timeSignature: fileTimeSignature } = await parseMidiFile(file)

      if (withNotes.length === 0) {
        setStatus('No note data found in this file.')
        setError(true)
        setTracks([])
        return
      }

      setPpq(filePpq)
      setTimeSignature(fileTimeSignature)
      setTracks(withNotes)
      setSelectedIndices([0])
      setMeta(`${withNotes.length} track(s) with notes · ${filePpq} ticks/quarter`)
      setStatus('Parsed OK. Select one or more tracks and an instrument, then start training.')
    } catch (err) {
      console.error(err)
      setStatus(`Could not parse this file: ${err.message}`)
      setError(true)
    }
  }

  const handleTrackToggle = (i) => {
    setSelectedIndices((prev) => (
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    ))
  }

  const startTraining = () => {
    if (selectedIndices.length === 0) return
    setScreen('training')
  }

  const backToSelection = () => setScreen('selection')

  // Merged into one note stream regardless of how many tracks are
  // selected, so everything downstream (playback, notation, fingering)
  // keeps working with a single track shape.
  const track = useMemo(() => combineTracks(tracks, selectedIndices), [tracks, selectedIndices])

  if (screen === 'training') {
    return (
      <TrainingScreen
        track={track}
        trackName={track.name}
        ppq={ppq}
        timeSignature={timeSignature}
        instrumentId={instrument}
        tempo={tempo}
        onTempoChange={setTempo}
        onBack={backToSelection}
      />
    )
  }

  return (
    <SelectionScreen
      tracks={tracks}
      selectedIndices={selectedIndices}
      instrument={instrument}
      status={status}
      error={error}
      meta={meta}
      onFile={handleFile}
      onTrackToggle={handleTrackToggle}
      onInstrumentChange={setInstrument}
      onStart={startTraining}
    />
  )
}
