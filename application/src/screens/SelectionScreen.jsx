import { INSTRUMENTS } from '../instruments'

export default function SelectionScreen({
  tracks,
  selectedIndices,
  instrument,
  status,
  error,
  meta,
  onFile,
  onTrackToggle,
  onInstrumentChange,
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
