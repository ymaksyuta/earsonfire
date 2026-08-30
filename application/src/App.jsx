import { useState } from 'react'
import { parseMidiFile } from './core/loadMidiFile'
import SelectionScreen from './screens/SelectionScreen'
import TrainingScreen from './screens/TrainingScreen'

export default function App() {
  const [tracks, setTracks] = useState([])
  const [trackIndex, setTrackIndex] = useState(0)
  const [ppq, setPpq] = useState(480)
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
      const { tracks: withNotes, ppq: filePpq } = await parseMidiFile(file)

      if (withNotes.length === 0) {
        setStatus('No note data found in this file.')
        setError(true)
        setTracks([])
        return
      }

      setPpq(filePpq)
      setTracks(withNotes)
      setTrackIndex(0)
      setMeta(`${withNotes.length} track(s) with notes · ${filePpq} ticks/quarter`)
      setStatus('Parsed OK. Select a track and instrument, then start training.')
    } catch (err) {
      console.error(err)
      setStatus(`Could not parse this file: ${err.message}`)
      setError(true)
    }
  }

  const handleTrackChange = (e) => setTrackIndex(parseInt(e.target.value, 10))

  const startTraining = () => {
    if (tracks.length === 0) return
    setScreen('training')
  }

  const backToSelection = () => setScreen('selection')

  const track = tracks[trackIndex]

  if (screen === 'training') {
    return (
      <TrainingScreen
        track={track}
        trackName={track?.name || `Track ${trackIndex + 1}`}
        ppq={ppq}
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
      trackIndex={trackIndex}
      instrument={instrument}
      status={status}
      error={error}
      meta={meta}
      onFile={handleFile}
      onTrackChange={handleTrackChange}
      onInstrumentChange={setInstrument}
      onStart={startTraining}
    />
  )
}
