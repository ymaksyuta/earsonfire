import { INSTRUMENTS } from '../instruments'
import { STRATEGIES } from '../core/resolveMonophonic'

export default function SelectionScreen({
  tracks,
  selectedIndices,
  instrument,
  strategy,
  primaryTrackIndex,
  status,
  error,
  meta,
  onFile,
  onTrackToggle,
  onInstrumentChange,
  onStrategyChange,
  onPrimaryTrackChange,
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
          <label>Tracks</label>
          {tracks.length === 0 ? (
            <div className="track-list-empty">Load a file first</div>
          ) : (
            <div className="track-list" role="group" aria-label="Tracks">
              {tracks.map((t, i) => (
                <label key={i} className="track-option">
                  <input
                    type="checkbox"
                    checked={selectedIndices.includes(i)}
                    onChange={() => onTrackToggle(i)}
                  />
                  <span>{t.name || `Track ${i + 1}`}</span>
                </label>
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
          {strategy === 'primary' && (
            <div className="field">
              <label htmlFor="primaryTrackSelect">Primary track</label>
              <select
                id="primaryTrackSelect"
                disabled={selectedIndices.length === 0}
                value={primaryTrackIndex ?? ''}
                onChange={(e) => onPrimaryTrackChange(parseInt(e.target.value, 10))}
              >
                {selectedIndices.map((i) => (
                  <option key={i} value={i}>{tracks[i]?.name || `Track ${i + 1}`}</option>
                ))}
              </select>
            </div>
          )}
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
    </div>
  )
}
