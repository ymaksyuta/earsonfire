import { useCallback, useEffect, useRef, useState } from 'react'
import { midiToFrequency } from './midiNotes'

// audio lead-in before the first note starts, so scheduling never races
// against AudioContext startup
const PLAYBACK_LEAD = 0.15
// how often (ms) we poll AudioContext time to advance the current-note cursor
const PLAYBACK_POLL_MS = 60

function lastNoteEnd(track) {
  if (!track || track.notes.length === 0) return 0
  const last = track.notes[track.notes.length - 1]
  return last.time + last.duration
}

// Owns Web Audio scheduling and transport state (playing/paused/current
// note). Instrument-agnostic: it only ever deals in MIDI note numbers
// and timing, never fingerings — that's instruments/, not this.
//
// Takes two separate note streams:
//   scoreTrack   always the combined/monophonic-resolved training
//                track (App.jsx's `track`). Drives the note cursor —
//                and therefore the notation highlight and fingering
//                diagram — regardless of what's actually audible.
//   audioTrack   what's actually scheduled as oscillators. Normally
//                the same notes as scoreTrack ("play my part"), but
//                can instead be a different, unrelated note stream
//                (e.g. the combined *non*-selected tracks, kept
//                polyphonic, for a "play the backing, I'll play my
//                part myself" practice mode) — see TrainingScreen's
//                playback-mode toggle. The cursor always follows
//                scoreTrack's own timeline either way, since both
//                streams share the same underlying file/timebase.
//
// `tempo` is a multiplier (1 = as written) sampled at the moment Play
// is pressed: changing the slider mid-playback takes effect on the
// next Play, since the oscillators are already scheduled at fixed
// times once started (see dev/notes.txt).
export function usePlayback(scoreTrack, audioTrack, tempo) {
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
    setCurrentNoteIndex(scoreTrack && scoreTrack.notes.length > 0 ? 0 : -1)
  }, [scoreTrack])

  // Re-sync whenever either stream changes (new file parsed, a
  // different track selected, or the playback-mode toggle swaps which
  // notes are audible) rather than requiring every call site to
  // remember to stop + reset by hand.
  useEffect(() => {
    stop()
    resetCursor()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreTrack, audioTrack])

  useEffect(() => stop, [stop])

  const start = useCallback(() => {
    if (!scoreTrack || scoreTrack.notes.length === 0) return
    stop()

    const AudioCtx = window.AudioContext || window.webkitAudioContext
    const ctx = new AudioCtx()
    audioCtxRef.current = ctx
    const base = ctx.currentTime + PLAYBACK_LEAD
    const speed = tempoRef.current

    scheduledRef.current = (audioTrack?.notes || []).map((n) => {
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

    // Stop once whichever of the two streams runs longer has finished
    // — e.g. a backing track that outlasts the (shorter, monophonic)
    // score shouldn't cut off early, and vice versa.
    const stopAt = Math.max(lastNoteEnd(scoreTrack), lastNoteEnd(audioTrack)) + 0.3
    const scoreNotes = scoreTrack.notes

    pollRef.current = setInterval(() => {
      const elapsed = (ctx.currentTime - base) * speed
      let idx = -1
      for (let i = 0; i < scoreNotes.length; i++) {
        if (scoreNotes[i].time <= elapsed) idx = i
        else break
      }
      setCurrentNoteIndex(idx)
      if (elapsed > stopAt) {
        stop()
        resetCursor()
      }
    }, PLAYBACK_POLL_MS)
  }, [scoreTrack, audioTrack, stop, resetCursor])

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
    if (!scoreTrack || scoreTrack.notes.length === 0) return
    stop()
    setCurrentNoteIndex((idx) => {
      const base = idx < 0 ? 0 : idx
      return Math.min(Math.max(base + delta, 0), scoreTrack.notes.length - 1)
    })
  }, [scoreTrack, stop])

  return { playing, paused, currentNoteIndex, start, stop, togglePause, stepNote }
}
