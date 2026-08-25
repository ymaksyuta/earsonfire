import { INSTRUMENTS } from '../instruments'

export default function SelectionScreen({
  tracks,
  trackIndex,
  instrument,
  status,
  error,
  meta,
  onFile,
  onTrackChange,
  onInstrumentChange,
  onStart,
}) {
  return (
    <div className="wrap">
      <h1>MIDI Score Viewer</h1>
      <p className="sub">Load a .mid file, pick a track, view the notation.</p>

      <div className="panel">
        <div className="row">
          <div className="field">
            <label htmlFor="fileInput">MIDI file</label>
            <input id="fileInput" type="file" accept=".mid,.midi" onChange={onFile} />
          </div>
          <div className="field">
            <label htmlFor="trackSelect">Track</label>
            <select
              id="trackSelect"
              disabled={tracks.length === 0}
              value={trackIndex}
              onChange={onTrackChange}
            >
              {tracks.length === 0 && <option>Load a file first</option>}
              {tracks.map((t, i) => (
                <option key={i} value={i}>
                  {t.name || `Track ${i + 1}`} — {t.notes.length} notes
                </option>
              ))}
            </select>
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
        <div id="status" className={error ? 'error' : ''}>{status}</div>
        <div className="meta">{meta}</div>
        <div className="row start-row">
          <button
            type="button"
            className="start-btn"
            onClick={onStart}
            disabled={tracks.length === 0}
          >
            Start training ▶
          </button>
        </div>
      </div>
    </div>
  )
}
