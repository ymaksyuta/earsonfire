import { useState, useRef, useCallback } from 'react'
import { Midi } from '@tonejs/midi'
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from 'vexflow'

const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']
const MAX_NOTES_RENDERED = 64 // keep the demo fast/legible
const NOTES_PER_STAVE = 8
const STAVE_WIDTH = 260

function midiToVexKey(midiNum) {
  const name = NOTE_NAMES[midiNum % 12]
  const octave = Math.floor(midiNum / 12) - 1
  return `${name}/${octave}`
}

function ticksToDuration(ticks, ppq) {
  const quarters = Math.max(ticks, 1) / ppq
  const table = [
    { q: 4, d: 'w' }, { q: 2, d: 'h' }, { q: 1, d: 'q' },
    { q: 0.5, d: '8' }, { q: 0.25, d: '16' }, { q: 0.125, d: '32' }
  ]
  let best = table[2]
  let bestDiff = Infinity
  for (const c of table) {
    const diff = Math.abs(Math.log2(c.q) - Math.log2(quarters))
    if (diff < bestDiff) { bestDiff = diff; best = c }
  }
  return best.d
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export default function App() {
  const [tracks, setTracks] = useState([])
  const [trackIndex, setTrackIndex] = useState(0)
  const [ppq, setPpq] = useState(480)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(false)
  const [meta, setMeta] = useState('')
  const [noteInfo, setNoteInfo] = useState('')
  const notationRef = useRef(null)

  const renderTrack = useCallback((tracksArg, index, ppqArg) => {
    const container = notationRef.current
    if (!container) return
    container.innerHTML = ''

    const track = tracksArg[index]
    if (!track) return

    const notes = track.notes.slice(0, MAX_NOTES_RENDERED)
    setNoteInfo(
      notes.length < track.notes.length
        ? `Showing first ${notes.length} of ${track.notes.length} notes.`
        : `${notes.length} notes.`
    )

    if (notes.length === 0) {
      container.innerHTML = '<div class="empty">This track has no notes.</div>'
      return
    }

    const groups = chunk(notes, NOTES_PER_STAVE)
    const totalWidth = groups.length * STAVE_WIDTH + 20

    const renderer = new Renderer(container, Renderer.Backends.SVG)
    renderer.resize(totalWidth, 140)
    const context = renderer.getContext()

    let x = 10
    groups.forEach((group, gi) => {
      const stave = new Stave(x, 20, STAVE_WIDTH)
      if (gi === 0) stave.addClef('treble')
      stave.setContext(context).draw()

      const vfNotes = group.map((n) => {
        const key = midiToVexKey(n.midi)
        const sn = new StaveNote({
          keys: [key],
          duration: ticksToDuration(n.durationTicks, ppqArg)
        })
        if (key.includes('#')) sn.addModifier(new Accidental('#'), 0)
        return sn
      })

      const voice = new Voice({ num_beats: vfNotes.length, beat_value: 4 }).setStrict(false)
      voice.addTickables(vfNotes)
      new Formatter().joinVoices([voice]).format([voice], STAVE_WIDTH - 30)
      voice.draw(context, stave)

      x += STAVE_WIDTH
    })
  }, [])

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setStatus(`Parsing ${file.name} …`)
    setError(false)

    try {
      const buf = await file.arrayBuffer()
      const midi = new Midi(buf)
      const withNotes = midi.tracks.filter((t) => t.notes.length > 0)

      if (withNotes.length === 0) {
        setStatus('No note data found in this file.')
        setError(true)
        setTracks([])
        if (notationRef.current) notationRef.current.innerHTML = ''
        return
      }

      setPpq(midi.header.ppq)
      setTracks(withNotes)
      setTrackIndex(0)
      setMeta(`${withNotes.length} track(s) with notes · ${midi.header.ppq} ticks/quarter`)
      setStatus('Parsed OK. Select a track to render.')
      renderTrack(withNotes, 0, midi.header.ppq)
    } catch (err) {
      console.error(err)
      setStatus(`Could not parse this file: ${err.message}`)
      setError(true)
    }
  }

  const handleTrackChange = (e) => {
    const idx = parseInt(e.target.value, 10)
    setTrackIndex(idx)
    renderTrack(tracks, idx, ppq)
  }

  return (
    <div className="wrap">
      <h1>MIDI Score Viewer</h1>
      <p className="sub">Load a .mid file, pick a track, view the notation.</p>

      <div className="panel">
        <div className="row">
          <div className="field">
            <label htmlFor="fileInput">MIDI file</label>
            <input id="fileInput" type="file" accept=".mid,.midi" onChange={handleFile} />
          </div>
          <div className="field">
            <label htmlFor="trackSelect">Track</label>
            <select
              id="trackSelect"
              disabled={tracks.length === 0}
              value={trackIndex}
              onChange={handleTrackChange}
            >
              {tracks.length === 0 && <option>Load a file first</option>}
              {tracks.map((t, i) => (
                <option key={i} value={i}>
                  {t.name || `Track ${i + 1}`} — {t.notes.length} notes
                </option>
              ))}
            </select>
          </div>
        </div>
        <div id="status" className={error ? 'error' : ''}>{status}</div>
        <div className="meta">{meta}</div>
      </div>

      <div id="scoreScroll">
        <div id="notation" ref={notationRef}></div>
      </div>
      <div className="note-count">{noteInfo}</div>
    </div>
  )
}
