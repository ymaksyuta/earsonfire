import { INSTRUMENTS } from '../instruments'
import { STRATEGIES } from '../core/resolveMonophonic'
import { formatBuildInfo } from '../core/buildInfo'

export default function SelectionScreen({
  tracks,
  selectedIndices,
  trackOrder,
  instrument,
  strategy,
  status,
  error,
  meta,
  onFile,
  onTrackToggle,
  onTrackMove,
  onInstrumentChange,
  onStrategyChange,
  onStart,
}) {
  return (
    <div className="wrap">
      <h1>MIDI Score Viewer</h1>
      <p className="sub">Load a .mid file, pick one or more tracks, view the notation.</p>

      <div className="panel">
        <div className="row">
          <div className="field">
            <label htmlFor="fileInput">MIDI file</label>
            <input id="fileInput" type="file" accept=".mid,.midi" onChange={onFile} />
          </div>
          <div className="field">
            <label htmlFor="instrumentSelect">Instrument</label>
            <select
              id="instrumentSelect"
              value={instrument}
              onChange={(e) => onInstrumentChange(e.target.value)}
            >
              {INSTRUMENTS.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field track-field">
          <label>
            Tracks
            {strategy === 'priority' && selectedIndices.length > 1 && (
              <span className="track-field-hint"> — order sets priority, top wins ties</span>
            )}
          </label>
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
            <label htmlFor="strategySelect">Simultaneous notes</label>
            <select
              id="strategySelect"
              value={strategy}
              onChange={(e) => onStrategyChange(e.target.value)}
            >
              {STRATEGIES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div id="status" className={error ? 'error' : ''}>{status}</div>
        <div className="meta">{meta}</div>
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

      <div className="version-info">{formatBuildInfo()}</div>
    </div>
  )
}
