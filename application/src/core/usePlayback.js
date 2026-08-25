import { useCallback, useEffect, useRef, useState } from 'react'
import { midiToFrequency } from './midiNotes'

// audio lead-in before the first note starts, so scheduling never races
// against AudioContext startup
const PLAYBACK_LEAD = 0.15
// how often (ms) we poll AudioContext time to advance the current-note cursor
const PLAYBACK_POLL_MS = 60

// Owns Web Audio scheduling and transport state (playing/paused/current
// note) for one track. Instrument-agnostic: it only ever deals in MIDI
// note numbers and timing, never fingerings — that's instruments/, not
// this. `tempo` is a multiplier (1 = as written) sampled at the moment
// Play is pressed: changing the slider mid-playback takes effect on the
// next Play, since the oscillators are already scheduled at fixed times
// once started (see dev/notes.txt).
export function usePlayback(track, tempo) {
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [currentNoteIndex, setCurrentNoteIndex] = useState(-1)

  const audioCtxRef = useRef(null)
  const scheduledRef = useRef([])
  const pollRef = useRef(null)
  const tempoRef = useRef(tempo)

  useEffect(() => {
    tempoRef.current = tempo
  }, [tempo])

  const stop = useCallback(() => {
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

  const resetCursor = useCallback(() => {
    setCurrentNoteIndex(track && track.notes.length > 0 ? 0 : -1)
  }, [track])

  // Re-sync whenever the track itself changes (new file parsed, or a
  // different track selected) rather than requiring every call site to
  // remember to stop + reset by hand.
  useEffect(() => {
    stop()
    resetCursor()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track])

  useEffect(() => stop, [stop])

  const start = useCallback(() => {
    if (!track || track.notes.length === 0) return
    stop()

    const AudioCtx = window.AudioContext || window.webkitAudioContext
    const ctx = new AudioCtx()
    audioCtxRef.current = ctx
    const base = ctx.currentTime + PLAYBACK_LEAD
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
        stop()
        resetCursor()
      }
    }, PLAYBACK_POLL_MS)
  }, [track, stop, resetCursor])

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

  // Manual step through the score, independent of audio playback — lets a
  // player browse fingerings for upcoming/previous notes at their own
  // pace instead of only ever seeing wherever the transport cursor is.
  const stepNote = useCallback((delta) => {
    if (!track || track.notes.length === 0) return
    stop()
    setCurrentNoteIndex((idx) => {
      const base = idx < 0 ? 0 : idx
      return Math.min(Math.max(base + delta, 0), track.notes.length - 1)
    })
  }, [track, stop])

  return { playing, paused, currentNoteIndex, start, stop, togglePause, stepNote }
}
