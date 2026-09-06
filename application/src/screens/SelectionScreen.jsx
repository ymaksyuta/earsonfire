import { useEffect, useRef } from 'react'
import { STRATEGIES } from '../core/resolveMonophonic'
import { renderScore } from '../core/notation'
import { downloadTrackAsMidi } from '../core/exportMidi'
import { formatBuildInfo } from '../core/buildInfo'

export default function SelectionScreen({
  tracks,
  fileName,
  selectedIndices,
  trackOrder,
  strategy,
  track,
  ppq,
  timeSignature,
  onFile,
  onTrackToggle,
  onTrackMove,
  onStrategyChange,
  onStart,
}) {
  const notationRef = useRef(null)
  const totalNotes = track?.notes.length ?? 0
  const activeStrategy = STRATEGIES.find((s) => s.id === strategy)

  // Full-height fixed/scroll split (see App.css) only applies to this
  // screen — toggle it on <body> for the lifetime of the screen rather
  // than baking it into a shared layout class, since TrainingScreen
  // still just scrolls as one normal page.
  useEffect(() => {
    document.body.classList.add('screen-selection')
    return () => document.body.classList.remove('screen-selection')
  }, [])

  // Read-only preview of the same score TrainingScreen renders — no
  // active-note highlight or auto-scroll here since nothing is playing
  // yet, just a look at what the current track/strategy combination
  // produces before committing to Start training.
  useEffect(() => {
    const container = notationRef.current
    if (!container) return
    renderScore(container, track, ppq, timeSignature)
  }, [track, ppq, timeSignature])

  return (
    <div className="wrap select-wrap">
      <h1>Ears on Fire</h1>

      <div className="select-fixed panel">
        <div className="row toolbar-row">
          <label htmlFor="fileInput" className="back-btn load-btn">Load…</label>
          <input
            id="fileInput"
            type="file"
            accept=".mid,.midi"
            aria-label="MIDI file"
            className="visually-hidden"
            onChange={onFile}
          />
          <span className="filename-placeholder">{fileName || 'No file loaded'}</span>
          <button
            type="button"
            className="back-btn export-btn"
            onClick={() => downloadTrackAsMidi(track)}
            disabled={!track || totalNotes === 0}
            title="Export the current combined track as a .mid file"
          >
            ⭳ MIDI
          </button>
        </div>

        <div id="scoreScroll">
          <div id="notation" ref={notationRef}></div>
        </div>

        <div className="row start-row">
          <button
            type="button"
            className="start-btn"
            onClick={onStart}
            disabled={selectedIndices.length === 0}
          >
            Start training ▶
          </button>
        </div>
      </div>

      <div className="select-scroll">
        <div className="field track-field">
          {tracks.length === 0 ? (
            <div className="track-list-empty">Load a file first</div>
          ) : (
            <div className="track-list" role="group" aria-label="Tracks">
              {trackOrder.map((i, pos) => (
                <div key={i} className="track-option">
                  <label className="track-option-label">
                    <input
                      type="checkbox"
                      checked={selectedIndices.includes(i)}
                      onChange={() => onTrackToggle(i)}
                    />
                    <span>{tracks[i]?.name || `Track ${i + 1}`}</span>
                  </label>
                  <div className="track-move-buttons">
                    <button
                      type="button"
                      className="track-move-btn"
                      aria-label={`Move ${tracks[i]?.name || `Track ${i + 1}`} up`}
                      disabled={pos === 0}
                      onClick={() => onTrackMove(pos, -1)}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="track-move-btn"
                      aria-label={`Move ${tracks[i]?.name || `Track ${i + 1}`} down`}
                      disabled={pos === trackOrder.length - 1}
                      onClick={() => onTrackMove(pos, 1)}
                    >
                      ▼
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="row">
          <div className="field">
            <select
              id="strategySelect"
              aria-label="Simultaneous notes"
              value={strategy}
              onChange={(e) => onStrategyChange(e.target.value)}
            >
              {STRATEGIES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Always rendered (never conditionally omitted) so this slot's
            height is constant across every strategy — swapping the hint
            text must never shift the track list above or reflow the
            scroll position. */}
        <div className="track-field-hint">{activeStrategy?.hint}</div>

        <div className="version-info">{formatBuildInfo()}</div>
      </div>
    </div>
  )
}
