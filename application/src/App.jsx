import { useState, useRef, useCallback, useEffect } from 'react'
import { Midi } from '@tonejs/midi'
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from 'vexflow'
import { getClarinetFingering } from './fingeringData'
import FingeringDiagram from './FingeringDiagram'

const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']
const MAX_NOTES_RENDERED = 64 // keep the demo fast/legible
const NOTES_PER_STAVE = 8
// Minimum width for a stave; groups that need more (many notes, lots of
// accidentals) get widened — see the width calculation in renderTrack.
const MIN_STAVE_WIDTH = 260
// Extra room beyond VexFlow's own minimum width estimate, for the clef
// (first stave only) and breathing room around the barline.
const STAVE_PADDING = 40

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

// Instruments with fingering support. Only 'clarinet' has fingering data so
// far (see fingeringData.js) — this list is where future instruments
// (recorder, calimba, ...) get wired in per the project roadmap.
const INSTRUMENTS = [
  { id: 'none', label: 'None' },
  { id: 'clarinet', label: 'Clarinet (Bb)' },
]

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
  const [instrument, setInstrument] = useState('none')
  // Playback speed multiplier: 1 = as written, <1 slower, >1 faster.
  // Only affects the audio scheduling clock, not the notation itself.
  const [tempo, setTempo] = useState(1)
  // 'selection' (file/track/instrument setup) or 'training' (score +
  // playback + fingering). Splitting these into separate screens keeps
  // each one uncluttered on a phone-sized viewport instead of stacking
  // every control and the whole score in one scroll.
  const [screen, setScreen] = useState('selection')
  const notationRef = useRef(null)
  const scoreScrollRef = useRef(null)
  const audioCtxRef = useRef(null)
  const scheduledRef = useRef([])
  const baseTimeRef = useRef(0)
  const pollRef = useRef(null)
  const tempoRef = useRef(1)
  // x-center (px, within #notation) of each rendered note's stave group,
  // filled in by renderTrack — lets us scroll the active note into view
  // without re-deriving stave/group math at scroll time.
  const noteXRef = useRef([])

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

    // capture the tempo in effect at the moment playback starts — changing
    // the slider mid-playback takes effect on the next Play, not live,
    // since the oscillators below are already scheduled at fixed times
    const speed = tempoRef.current

    scheduledRef.current = track.notes.map((n) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = midiToFrequency(n.midi)
      const startAt = base + n.time / speed
      const dur = Math.max(n.duration / speed, 0.05)
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
      const elapsed = (ctx.currentTime - base) * speed
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

  useEffect(() => {
    tempoRef.current = tempo
  }, [tempo])

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

  // Manual step through the score, independent of audio playback — lets a
  // player browse fingerings for upcoming/previous notes at their own
  // pace instead of only ever seeing wherever the transport cursor is.
  const stepNote = useCallback((delta) => {
    const notes = tracks[trackIndex]?.notes
    if (!notes || notes.length === 0) return
    stopPlayback()
    setCurrentNoteIndex((idx) => {
      const base = idx < 0 ? 0 : idx
      return Math.min(Math.max(base + delta, 0), notes.length - 1)
    })
  }, [tracks, trackIndex, stopPlayback])

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

    // Build the notes/voice for every group first so we can measure how
    // much horizontal space each one actually needs before laying out
    // staves. A fixed stave width per group let the formatter overflow
    // past its column whenever a group had many notes or wide
    // (accidental-heavy) notes — that overflow pushed into the next
    // stave and made its barline appear to cut through still-visible
    // notes from the previous group.
    const groups = chunk(notes, NOTES_PER_STAVE)
    const staveInfos = groups.map((group, gi) => {
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

      const formatter = new Formatter().joinVoices([voice])
      const minWidth = formatter.preCalculateMinTotalWidth([voice])
      const width = Math.max(MIN_STAVE_WIDTH, minWidth + STAVE_PADDING)

      return { vfNotes, voice, formatter, width }
    })

    const totalWidth = staveInfos.reduce((sum, { width }) => sum + width, 0) + 20

    const renderer = new Renderer(container, Renderer.Backends.SVG)
    renderer.resize(totalWidth, 140)
    const context = renderer.getContext()

    const noteX = []
    let x = 10
    staveInfos.forEach(({ vfNotes, voice, formatter, width }, gi) => {
      const stave = new Stave(x, 20, width)
      if (gi === 0) stave.addClef('treble')
      stave.setContext(context).draw()

      formatter.format([voice], width - 30)
      voice.draw(context, stave)

      vfNotes.forEach((sn) => noteX.push(sn.getAbsoluteX()))

      x += width
    })
    noteXRef.current = noteX
  }, [])

  // Keep the score horizontally centered on whichever note is "current",
  // whether that's advancing from playback or from manual stepping —
  // this is the score's auto-follow; the container also stays freely
  // scrollable by hand (touch/drag/wheel) at any time via overflow-x.
  useEffect(() => {
    const scroller = scoreScrollRef.current
    const targetX = noteXRef.current[currentNoteIndex]
    if (!scroller || targetX == null) return
    const target = targetX - scroller.clientWidth / 2
    scroller.scrollTo({ left: Math.max(target, 0), behavior: 'smooth' })
  }, [currentNoteIndex])

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
      setStatus('Parsed OK. Select a track and instrument, then start training.')
      stopPlayback()
      resetCursor(withNotes, 0)
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

  const startTraining = () => {
    if (tracks.length === 0) return
    setScreen('training')
    // the score container only exists once the training screen mounts,
    // so (re)render into it now rather than relying on the render that
    // ran while it was still off-screen
    requestAnimationFrame(() => renderTrack(tracks, trackIndex, ppq, currentNoteIndex))
  }

  const backToSelection = () => {
    stopPlayback()
    setScreen('selection')
  }

  // keep the notation highlight in sync while the current note advances
  // during playback (or resets after stop/track change)
  useEffect(() => {
    if (tracks.length > 0) {
      renderTrack(tracks, trackIndex, ppq, currentNoteIndex)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNoteIndex])

  if (screen === 'training') {
    const track = tracks[trackIndex]
    return (
      <div className="wrap">
        <div className="topbar">
          <button type="button" className="back-btn" onClick={backToSelection}>← Back</button>
          <div className="topbar-title">
            {track?.name || `Track ${trackIndex + 1}`}
            {instrument !== 'none' && (
              <span className="topbar-instrument">
                {' '}· {INSTRUMENTS.find((i) => i.id === instrument)?.label}
              </span>
            )}
          </div>
        </div>

        <div className="panel playback-panel">
          <div className="row playback-row">
            <button
              type="button"
              onClick={() => stepNote(-1)}
              disabled={tracks.length === 0 || currentNoteIndex <= 0}
              title="Step to previous note"
            >
              ⏮
            </button>
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
            <button
              type="button"
              onClick={() => stepNote(1)}
              disabled={tracks.length === 0 || currentNoteIndex >= (track?.notes.length ?? 0) - 1}
              title="Step to next note"
            >
              ⏭
            </button>
            {playing && (
              <span className="playback-status">
                Note {currentNoteIndex + 1} / {track?.notes.length ?? 0}
              </span>
            )}
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
              onChange={(e) => setTempo(parseFloat(e.target.value))}
            />
          </div>
        </div>

        <div id="scoreScroll" ref={scoreScrollRef}>
          <div id="notation" ref={notationRef}></div>
        </div>
        <div className="note-count">{noteInfo}</div>

        {instrument === 'clarinet' && (
          <div className="panel fingering-panel">
            <label>Clarinet fingering</label>
            <div className="fingering-row">
              {['Prev', 'Now', 'Next', 'Next +1'].map((label, i) => {
                const offset = i - 1 // Prev=-1, Now=0, Next=+1, Next+1=+2
                const notes = track?.notes || []
                const idx = Math.max(currentNoteIndex, 0) + offset
                const note = notes[idx]
                const fingering = note ? getClarinetFingering(note.midi) : null
                return <FingeringDiagram key={label} label={label} fingering={fingering} />
              })}
            </div>
          </div>
        )}
      </div>
    )
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
          <div className="field">
            <label htmlFor="instrumentSelect">Instrument</label>
            <select
              id="instrumentSelect"
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
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
            onClick={startTraining}
            disabled={tracks.length === 0}
          >
            Start training ▶
          </button>
        </div>
      </div>
    </div>
  )
}
