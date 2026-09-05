import { useEffect, useMemo, useState } from 'react'
import { parseMidiFile } from './core/loadMidiFile'
import { combineTracks } from './core/combineTracks'
import { resolveMonophonic, DEFAULT_STRATEGY } from './core/resolveMonophonic'
import SelectionScreen from './screens/SelectionScreen'
import TrainingScreen from './screens/TrainingScreen'

export default function App() {
  const [tracks, setTracks] = useState([])
  // Indices into `tracks`. Training plays/notates the selected tracks
  // as one merged voice — see core/combineTracks.js.
  const [selectedIndices, setSelectedIndices] = useState([])
  // How to pick one note out of any overlapping cluster produced by
  // combining tracks, since the instrument is assumed monophonic for
  // now — see core/resolveMonophonic.js.
  const [strategy, setStrategy] = useState(DEFAULT_STRATEGY)
  // Index into `tracks` (not into selectedIndices) designating the
  // "primary" track for the 'primary' strategy once it's implemented;
  // kept valid (reset to the first selected track) whenever the
  // selection changes and the current value falls outside it.
  const [primaryTrackIndex, setPrimaryTrackIndex] = useState(null)
  const [ppq, setPpq] = useState(480)
  // [numerator, denominator], e.g. [4, 4]. Used to lay out one musical
  // measure per stave — see notation.js.
  const [timeSignature, setTimeSignature] = useState([4, 4])
  const [status, setStatus] = useState('')
  const [error, setError] = useState(false)
  const [meta, setMeta] = useState('')
  const [instrument, setInstrument] = useState('none')
  // Which note stream is actually audible in Training: 'mine' plays
  // the selected/combined track itself (the default — hear what you
  // should play); 'others' plays everything NOT selected instead, so
  // the player can perform their own part live against a backing track
  // while the score/fingering diagram keep following their part's
  // timing regardless — see usePlayback.js and TrainingScreen's mode
  // toggle. Owned here (not TrainingScreen) so it persists the same
  // way `tempo` does across pause/stop within a session.
  const [playbackMode, setPlaybackMode] = useState('mine')
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

  // Keep the primary-track choice valid: default it once a selection
  // exists, and re-pick from the (still-)selected tracks if the user
  // unchecks whichever one was previously designated primary.
  useEffect(() => {
    if (selectedIndices.length === 0) {
      setPrimaryTrackIndex(null)
    } else if (!selectedIndices.includes(primaryTrackIndex)) {
      setPrimaryTrackIndex(selectedIndices[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndices])

  const startTraining = () => {
    if (selectedIndices.length === 0) return
    setScreen('training')
  }

  const backToSelection = () => setScreen('selection')

  // Merged into one note stream regardless of how many tracks are
  // selected, then reduced to a single monophonic stream per the
  // chosen strategy — see combineTracks.js and resolveMonophonic.js.
  // Everything downstream (playback, notation, fingering) keeps
  // working with the same single-track shape it always has.
  const combined = useMemo(() => combineTracks(tracks, selectedIndices), [tracks, selectedIndices])
  const track = useMemo(() => ({
    notes: resolveMonophonic(combined.notes, strategy, { primaryTrackIndex }),
    name: combined.name
  }), [combined, strategy, primaryTrackIndex])

  // The complement of the selection — every track NOT checked on the
  // Selection screen — combined the same way but deliberately NOT
  // pushed through resolveMonophonic: this stream only ever feeds the
  // 'others' playback mode as a backing track (see usePlayback.js), so
  // keeping its original chords/polyphony is the point, unlike `track`
  // above which needs a single monophonic voice for the score/fingering.
  const otherIndices = useMemo(
    () => tracks.map((_, i) => i).filter((i) => !selectedIndices.includes(i)),
    [tracks, selectedIndices]
  )
  const otherTrack = useMemo(() => combineTracks(tracks, otherIndices), [tracks, otherIndices])

  // Fall back to 'mine' whenever there's nothing to play as a backing
  // track (no file loaded yet, or every track is selected) so the
  // toggle can't get stuck pointed at a silent, empty stream.
  useEffect(() => {
    if (playbackMode === 'others' && otherTrack.notes.length === 0) {
      setPlaybackMode('mine')
    }
  }, [playbackMode, otherTrack])

  if (screen === 'training') {
    return (
      <TrainingScreen
        track={track}
        otherTrack={otherTrack}
        trackName={track.name}
        ppq={ppq}
        timeSignature={timeSignature}
        instrumentId={instrument}
        tempo={tempo}
        onTempoChange={setTempo}
        playbackMode={playbackMode}
        onPlaybackModeChange={setPlaybackMode}
        onBack={backToSelection}
      />
    )
  }

  return (
    <SelectionScreen
      tracks={tracks}
      selectedIndices={selectedIndices}
      instrument={instrument}
      strategy={strategy}
      primaryTrackIndex={primaryTrackIndex}
      status={status}
      error={error}
      meta={meta}
      onFile={handleFile}
      onTrackToggle={handleTrackToggle}
      onInstrumentChange={setInstrument}
      onStrategyChange={setStrategy}
      onPrimaryTrackChange={setPrimaryTrackIndex}
      onStart={startTraining}
    />
  )
}
