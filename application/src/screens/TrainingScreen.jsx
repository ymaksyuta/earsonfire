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
  polyphonic,
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
  // Whether the tempo slider popup is open. Local/ephemeral (unlike
  // `tempo` itself, which App.jsx owns so it survives pause/stop) since
  // there's nothing to preserve about the popup being open across a
  // screen change.
  const [showTempo, setShowTempo] = useState(false)
  const tempoControlRef = useRef(null)

  // The score/cursor always follows `track` (see usePlayback.js); only
  // which notes are actually audible changes with the mode toggle.
  const audioTrack = playbackMode === 'others' ? otherTrack : track
  const hasBacking = (otherTrack?.notes.length ?? 0) > 0

  const { playing, paused, currentNoteIndex, start, stop, togglePause, stepNote, selectNote } =
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
    const { noteInfo: info, noteX } = renderScore(
      container, track, ppq, timeSignature, currentNoteIndex,
      { polyphonic, onNoteClick: selectNote }
    )
    setNoteInfo(info)
    noteXRef.current = noteX
  }, [track, ppq, timeSignature, currentNoteIndex, polyphonic, selectNote])

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

  // Close the tempo popup on any tap/click outside it — there's no
  // explicit close button, just tapping elsewhere.
  useEffect(() => {
    if (!showTempo) return
    const handleOutside = (e) => {
      if (tempoControlRef.current && !tempoControlRef.current.contains(e.target)) {
        setShowTempo(false)
      }
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => document.removeEventListener('pointerdown', handleOutside)
  }, [showTempo])

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
          <button
            type="button"
            className="icon-btn"
            onClick={() => onPlaybackModeChange(playbackMode === 'others' ? 'mine' : 'others')}
            disabled={!hasBacking}
            aria-label="Toggle playback part"
            title={hasBacking
              ? (playbackMode === 'others'
                ? 'Playing backing (others) — tap to hear your part instead'
                : 'Playing your part — tap to hear the backing (others) instead')
              : 'No other tracks to use as backing'}
          >
            {playbackMode === 'others' ? '🎧' : '🎵'}
          </button>
          <div className="tempo-control" ref={tempoControlRef}>
            <button
              type="button"
              className="icon-btn tempo-btn"
              onClick={() => setShowTempo((v) => !v)}
              aria-label="Tempo"
              title="Adjust tempo"
            >
              ⏱ {tempo.toFixed(2)}×
            </button>
            {showTempo && (
              <div className="tempo-popup">
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
            )}
          </div>
          {playing && (
            <span className="playback-status">
              Note {currentNoteIndex + 1} / {totalNotes}
            </span>
          )}
        </div>
      </div>

      <div id="scoreScroll" ref={scoreScrollRef}>
        <div id="notation" ref={notationRef}></div>
      </div>
      <div className="note-count">{noteInfo}</div>

      {/* Fingering assumes exactly one active note at a time — doesn't
          apply once 'none' (polyphonic, no reduction) is the selected
          strategy, since several notes can be sounding at once then. */}
      {!polyphonic && instrument.FingeringDiagram && (
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
