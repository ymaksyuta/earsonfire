import { useEffect, useRef, useState } from 'react'
import { usePlayback } from '../core/usePlayback'
import { renderScore } from '../core/notation'
import { INSTRUMENTS, getInstrument } from '../instruments'

export default function TrainingScreen({
  track,
  otherTrack,
  trackName,
  ppq,
  timeSignature,
  instrumentId,
  onInstrumentChange,
  tempo,
  onTempoChange,
  playbackMode,
  onPlaybackModeChange,
  onBack,
}) {
  const notationRef = useRef(null)
  const scoreScrollRef = useRef(null)
  // x position (px, within #notation) of each rendered note — filled in
  // by renderScore, read by the auto-scroll effect below. A ref, not
  // state: it never needs to trigger a render on its own.
  const noteXRef = useRef([])
  const [noteInfo, setNoteInfo] = useState('')

  // The score/cursor always follows `track` (see usePlayback.js); only
  // which notes are actually audible changes with the mode toggle.
  const audioTrack = playbackMode === 'others' ? otherTrack : track
  const hasBacking = (otherTrack?.notes.length ?? 0) > 0

  const { playing, paused, currentNoteIndex, start, stop, togglePause, stepNote } =
    usePlayback(track, audioTrack, tempo)

  const instrument = getInstrument(instrumentId)
  const totalNotes = track?.notes.length ?? 0

  // Re-render the score whenever the track, its tick resolution, or the
  // highlighted note changes. One effect covering all three (rather than
  // mixing explicit renderScore() calls at each call site with a
  // narrower effect) keeps what's on screen guaranteed in sync, including
  // the edge case where the cursor lands on the same index across two
  // different tracks.
  useEffect(() => {
    const container = notationRef.current
    if (!container) return
    const { noteInfo: info, noteX } = renderScore(container, track, ppq, timeSignature, currentNoteIndex)
    setNoteInfo(info)
    noteXRef.current = noteX
  }, [track, ppq, timeSignature, currentNoteIndex])

  // Keep the score horizontally centered on whichever note is "current",
  // whether that's advancing from playback or from manual stepping. The
  // container also stays freely scrollable by hand (touch/drag/wheel) at
  // any time via overflow-x.
  useEffect(() => {
    const scroller = scoreScrollRef.current
    const targetX = noteXRef.current[currentNoteIndex]
    if (!scroller || targetX == null) return
    const target = targetX - scroller.clientWidth / 2
    scroller.scrollTo({ left: Math.max(target, 0), behavior: 'smooth' })
  }, [currentNoteIndex])

  return (
    <div className="wrap">
      <div className="topbar">
        <button type="button" className="back-btn" onClick={onBack}>← Back</button>
        <div className="topbar-title">{trackName}</div>
        <select
          id="instrumentSelect"
          className="topbar-instrument-select"
          aria-label="Instrument"
          value={instrumentId}
          onChange={(e) => onInstrumentChange(e.target.value)}
        >
          {INSTRUMENTS.map((inst) => (
            <option key={inst.id} value={inst.id}>{inst.label}</option>
          ))}
        </select>
      </div>

      <div className="panel playback-panel">
        <div className="row playback-row">
          <button
            type="button"
            onClick={() => stepNote(-1)}
            disabled={!track || currentNoteIndex <= 0}
            title="Step to previous note"
          >
            ⏮
          </button>
          <button type="button" onClick={playing ? togglePause : start} disabled={!track}>
            {playing ? (paused ? '▶ Resume' : '⏸ Pause') : '▶ Play'}
          </button>
          <button type="button" onClick={stop} disabled={!playing}>
            ⏹ Stop
          </button>
          <button
            type="button"
            onClick={() => stepNote(1)}
            disabled={!track || currentNoteIndex >= totalNotes - 1}
            title="Step to next note"
          >
            ⏭
          </button>
          {playing && (
            <span className="playback-status">
              Note {currentNoteIndex + 1} / {totalNotes}
            </span>
          )}
        </div>
        <div className="row mode-row">
          <button
            type="button"
            className="mode-btn"
            onClick={() => onPlaybackModeChange(playbackMode === 'others' ? 'mine' : 'others')}
            disabled={!hasBacking}
            title={hasBacking
              ? 'Switch between hearing your part and hearing everything else as backing'
              : 'No other tracks to use as backing'}
          >
            {playbackMode === 'others' ? '🎧 Playing: backing (others)' : '🎵 Playing: my part'}
          </button>
        </div>
        <div className="row tempo-row">
          <label htmlFor="tempoRange" className="tempo-label">
            Tempo {tempo.toFixed(2)}×
          </label>
          <input
            id="tempoRange"
            type="range"
            min="0.25"
            max="2"
            step="0.05"
            value={tempo}
            onChange={(e) => onTempoChange(parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div id="scoreScroll" ref={scoreScrollRef}>
        <div id="notation" ref={notationRef}></div>
      </div>
      <div className="note-count">{noteInfo}</div>

      {instrument.FingeringDiagram && (
        <div className="panel fingering-panel">
          <label>{instrument.label} fingering</label>
          <div className="fingering-row">
            {['Prev', 'Now', 'Next', 'Next +1'].map((label, i) => {
              const offset = i - 1 // Prev=-1, Now=0, Next=+1, Next+1=+2
              const notes = track?.notes || []
              const idx = Math.max(currentNoteIndex, 0) + offset
              const note = notes[idx]
              const fingering = note ? instrument.getFingering(note.midi) : null
              return <instrument.FingeringDiagram key={label} label={label} fingering={fingering} />
            })}
          </div>
        </div>
      )}
    </div>
  )
}
