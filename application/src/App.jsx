import { useState, useRef, useCallback, useEffect } from 'react'
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

// audio lead-in before the first note starts, so scheduling never races
// against AudioContext startup
const PLAYBACK_LEAD = 0.15
// how often (ms) we poll AudioContext time to advance the current-note cursor
const PLAYBACK_POLL_MS = 60

function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export default function App() {
  const [tracks, setTracks] = useState([])
  const [trackIndex, setTrackIndex] = useState(0)
  const [ppq, setPpq] = useState(480)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(false)
  const [meta, setMeta] = useState('')
  const [noteInfo, setNoteInfo] = useState('')
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [currentNoteIndex, setCurrentNoteIndex] = useState(-1)
  const notationRef = useRef(null)
  const audioCtxRef = useRef(null)
  const scheduledRef = useRef([])
  const baseTimeRef = useRef(0)
  const pollRef = useRef(null)

  const stopPlayback = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    scheduledRef.current.forEach(({ osc, gain }) => {
      try { osc.stop() } catch { /* already stopped */ }
      try { osc.disconnect(); gain.disconnect() } catch { /* already disconnected */ }
    })
    scheduledRef.current = []
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    setPlaying(false)
    setPaused(false)
  }, [])

  const resetCursor = useCallback((tracksArg, index) => {
    const notes = tracksArg[index]?.notes
    setCurrentNoteIndex(notes && notes.length > 0 ? 0 : -1)
  }, [])

  const startPlayback = useCallback(() => {
    const track = tracks[trackIndex]
    if (!track || track.notes.length === 0) return
    stopPlayback()

    const AudioCtx = window.AudioContext || window.webkitAudioContext
    const ctx = new AudioCtx()
    audioCtxRef.current = ctx
    const base = ctx.currentTime + PLAYBACK_LEAD
    baseTimeRef.current = base

    scheduledRef.current = track.notes.map((n) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = midiToFrequency(n.midi)
      const startAt = base + n.time
      const dur = Math.max(n.duration, 0.05)
      const peak = Math.min(Math.max(n.velocity || 0.8, 0.1), 1) * 0.25
      gain.gain.setValueAtTime(0, startAt)
      gain.gain.linearRampToValueAtTime(peak, startAt + 0.01)
      gain.gain.linearRampToValueAtTime(0, startAt + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(startAt)
      osc.stop(startAt + dur + 0.02)
      return { osc, gain }
    })

    setPlaying(true)
    setPaused(false)

    pollRef.current = setInterval(() => {
      const elapsed = ctx.currentTime - base
      const notes = track.notes
      let idx = -1
      for (let i = 0; i < notes.length; i++) {
        if (notes[i].time <= elapsed) idx = i
        else break
      }
      setCurrentNoteIndex(idx)
      const last = notes[notes.length - 1]
      if (elapsed > last.time + last.duration + 0.3) {
        stopPlayback()
        resetCursor(tracks, trackIndex)
      }
    }, PLAYBACK_POLL_MS)
  }, [tracks, trackIndex, stopPlayback, resetCursor])

  const togglePause = useCallback(() => {
    const ctx = audioCtxRef.current
    if (!ctx) return
    if (paused) {
      ctx.resume()
      setPaused(false)
    } else {
      ctx.suspend()
      setPaused(true)
    }
  }, [paused])

  const handleStop = useCallback(() => {
    stopPlayback()
    resetCursor(tracks, trackIndex)
  }, [stopPlayback, resetCursor, tracks, trackIndex])

  useEffect(() => stopPlayback, [stopPlayback])

  const renderTrack = useCallback((tracksArg, index, ppqArg, activeIndex = -1) => {
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

      const vfNotes = group.map((n, ni) => {
        const key = midiToVexKey(n.midi)
        const sn = new StaveNote({
          keys: [key],
          duration: ticksToDuration(n.durationTicks, ppqArg)
        })
        if (key.includes('#')) sn.addModifier(new Accidental('#'), 0)
        if (gi * NOTES_PER_STAVE + ni === activeIndex) {
          sn.setStyle({ fillStyle: '#5ac8a8', strokeStyle: '#5ac8a8' })
        }
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
      stopPlayback()
      resetCursor(withNotes, 0)
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
    stopPlayback()
    resetCursor(tracks, idx)
    renderTrack(tracks, idx, ppq)
  }

  // keep the notation highlight in sync while the current note advances
  // during playback (or resets after stop/track change)
  useEffect(() => {
    if (tracks.length > 0) {
      renderTrack(tracks, trackIndex, ppq, currentNoteIndex)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNoteIndex])

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
        <div className="row playback-row">
          <button
            type="button"
            onClick={playing ? togglePause : startPlayback}
            disabled={tracks.length === 0}
          >
            {playing ? (paused ? '▶ Resume' : '⏸ Pause') : '▶ Play'}
          </button>
          <button type="button" onClick={handleStop} disabled={!playing}>
            ⏹ Stop
          </button>
          {playing && (
            <span className="playback-status">
              Note {currentNoteIndex + 1} / {tracks[trackIndex]?.notes.length ?? 0}
            </span>
          )}
        </div>
      </div>

      <div id="scoreScroll">
        <div id="notation" ref={notationRef}></div>
      </div>
      <div className="note-count">{noteInfo}</div>
    </div>
  )
}
