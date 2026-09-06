import { useEffect, useMemo, useState } from 'react'
import { parseMidiFile } from './core/loadMidiFile'
import { combineTracks } from './core/combineTracks'
import { resolveMonophonic, DEFAULT_STRATEGY } from './core/resolveMonophonic'
import SelectionScreen from './screens/SelectionScreen'
import TrainingScreen from './screens/TrainingScreen'

export default function App() {
  const [tracks, setTracks] = useState([])
  const [fileName, setFileName] = useState('')
  // Indices into `tracks`. Training plays/notates the selected tracks
  // as one merged voice — see core/combineTracks.js.
  const [selectedIndices, setSelectedIndices] = useState([])
  // How to pick one note out of any overlapping cluster produced by
  // combining tracks, since the instrument is assumed monophonic for
  // now — see core/resolveMonophonic.js.
  const [strategy, setStrategy] = useState(DEFAULT_STRATEGY)
  // Array of indices into `tracks`, containing every track index
  // exactly once, ordered highest-priority-first. This is the order
  // the checkbox list is rendered in on SelectionScreen, and the user
  // can rearrange it there with the ▲▼ buttons. It doubles as the
  // ranking used by the 'priority' resolveMonophonic strategy: among
  // the *selected* tracks, whichever sits earliest in this array wins
  // when its notes overlap another selected track's — see
  // resolveMonophonic.js.
  const [trackOrder, setTrackOrder] = useState([])
  const [ppq, setPpq] = useState(480)
  // [numerator, denominator], e.g. [4, 4]. Used to lay out one musical
  // measure per stave — see notation.js.
  const [timeSignature, setTimeSignature] = useState([4, 4])
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
    setFileName(file.name)

    try {
      const { tracks: withNotes, ppq: filePpq, timeSignature: fileTimeSignature } = await parseMidiFile(file)

      if (withNotes.length === 0) {
        setTracks([])
        return
      }

      setPpq(filePpq)
      setTimeSignature(fileTimeSignature)
      setTracks(withNotes)
      setSelectedIndices([0])
      setTrackOrder(withNotes.map((_, i) => i))
    } catch (err) {
      console.error(err)
    }
  }

  const handleTrackToggle = (i) => {
    setSelectedIndices((prev) => (
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    ))
  }

  // Moves the track at position `pos` within `trackOrder` up or down by
  // one slot (direction -1 or +1), swapping it with its neighbor. This
  // reorders the checkbox list on SelectionScreen and, for whichever
  // tracks end up selected, their new relative order there is what the
  // 'priority' strategy ranks them by.
  const handleTrackMove = (pos, direction) => {
    setTrackOrder((prev) => {
      const target = pos + direction
      if (target < 0 || target >= prev.length) return prev
      const next = prev.slice()
      ;[next[pos], next[target]] = [next[target], next[pos]]
      return next
    })
  }

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
    notes: resolveMonophonic(combined.notes, strategy, { priorityOrder: trackOrder }),
    name: combined.name
  }), [combined, strategy, trackOrder])

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
        onInstrumentChange={setInstrument}
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
      fileName={fileName}
      selectedIndices={selectedIndices}
      trackOrder={trackOrder}
      strategy={strategy}
      track={track}
      ppq={ppq}
      timeSignature={timeSignature}
      onFile={handleFile}
      onTrackToggle={handleTrackToggle}
      onTrackMove={handleTrackMove}
      onStrategyChange={setStrategy}
      onStart={startTraining}
    />
  )
}
