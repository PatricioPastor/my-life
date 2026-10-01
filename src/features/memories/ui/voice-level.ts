import { useCallback, useEffect, useRef } from "react"

/**
 * The loudness of a memory's voice while it plays, as a smoothed level from 0 to 1 that the glass orb reads every
 * frame (to ripple and glow). The interface is one function: `useVoiceLevel(audioElement)` returns a stable reader
 * `() => number`. Integration note: another writer builds `ui/talking-orb.tsx` and `audio-level.ts` (an AnalyserNode
 * RMS to a smoothed level); either can replace this hook, since the glass view only needs that reader.
 */

/** Root mean square of a time-domain byte buffer (128 is silence), 0..1. */
export function byteRms(data: Uint8Array): number {
  if (data.length === 0) return 0
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128
    sum += v * v
  }
  return Math.sqrt(sum / data.length)
}

/** Lifts a raw RMS (speech sits around 0.05 to 0.25) onto 0..1, so a normal voice already moves the orb. */
export function levelFromRms(rms: number): number {
  return Math.min(Math.max(rms * 3.4, 0), 1) ** 0.7
}

const ATTACK_S = 0.05
const RELEASE_S = 0.22
const SILENCE = 0.002

/** One smoothing step: quick to rise, slow to fall, never past the target, and exactly 0 once it has faded out. */
export function smoothLevel(prev: number, target: number, dt: number): number {
  const rate = target > prev ? 1 / ATTACK_S : 1 / RELEASE_S
  const next = prev + (target - prev) * (1 - Math.exp(-rate * dt))
  return target === 0 && next < SILENCE ? 0 : next
}

/** A lively, speech-like level in 0..1 for when the browser has no Web Audio: the orb still talks while it plays. */
export function syntheticLevel(seconds: number): number {
  const syllable = 0.5 + 0.5 * Math.sin(seconds * 5.3)
  const phrase = 0.55 + 0.45 * Math.sin(seconds * 1.7 + 0.6)
  const grain = 0.5 + 0.5 * Math.sin(seconds * 11.9 + 1.3)
  return Math.min(Math.max(0.12 + 0.5 * syllable * phrase + 0.2 * grain * phrase, 0), 1)
}

interface Graph {
  ctx: AudioContext
  analyser: AnalyserNode
}

// A media element can be wired into Web Audio only once, so the graph lives as long as the element.
const graphs = new WeakMap<HTMLAudioElement, Graph>()

function graphFor(audio: HTMLAudioElement): Graph | null {
  if (typeof AudioContext === "undefined") return null
  const known = graphs.get(audio)
  if (known) return known
  try {
    const ctx = new AudioContext()
    const source = ctx.createMediaElementSource(audio)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.4
    source.connect(analyser)
    analyser.connect(ctx.destination)
    const graph = { ctx, analyser }
    graphs.set(audio, graph)
    return graph
  } catch {
    return null
  }
}

/**
 * A stable reader of the voice level (0..1) for an audio element. It builds the Web Audio graph only when the audio
 * first plays (a browser needs a gesture for that), samples an AnalyserNode once per frame while it plays, and keeps
 * easing down after it pauses until it is silent, then stops. Without Web Audio it makes a synthetic level instead.
 * The audio must be CORS-enabled (`crossOrigin="anonymous"`), or a browser mutes it once it is routed through Web Audio.
 */
export function useVoiceLevel(audio: HTMLAudioElement | null): () => number {
  const level = useRef(0)
  const read = useCallback(() => level.current, [])

  useEffect(() => {
    level.current = 0
    if (!audio) return
    let raf = 0
    let last = 0
    let playing = false
    let analyser: AnalyserNode | null = null
    let data: Uint8Array<ArrayBuffer> | null = null

    const tick = (now: number) => {
      raf = 0
      const dt = last === 0 ? 1 / 60 : Math.min((now - last) / 1000, 0.1)
      last = now
      let target = 0
      if (playing) {
        if (analyser && data) {
          analyser.getByteTimeDomainData(data)
          target = levelFromRms(byteRms(data))
        } else target = syntheticLevel(now / 1000)
      }
      level.current = smoothLevel(level.current, target, dt)
      if (playing || level.current > 0) raf = requestAnimationFrame(tick)
      else last = 0
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const onPlay = () => {
      playing = true
      const graph = graphFor(audio)
      if (graph) {
        void graph.ctx.resume?.()
        analyser = graph.analyser
        data = new Uint8Array(analyser.frequencyBinCount)
      }
      schedule()
    }
    const onStop = () => {
      playing = false
    }
    audio.addEventListener("play", onPlay)
    audio.addEventListener("pause", onStop)
    audio.addEventListener("ended", onStop)
    return () => {
      audio.removeEventListener("play", onPlay)
      audio.removeEventListener("pause", onStop)
      audio.removeEventListener("ended", onStop)
      cancelAnimationFrame(raf)
      level.current = 0
    }
  }, [audio])

  return read
}
