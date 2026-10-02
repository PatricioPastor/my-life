"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { byteRms, levelFromRms } from "./audio-level"

/** The parts of the Web Audio API this hook uses, so a test can stand in for them. */
export interface AnalyserLike {
  fftSize: number
  frequencyBinCount: number
  connect(destination: unknown): unknown
  disconnect(): void
  getByteTimeDomainData(array: Uint8Array): void
  getByteFrequencyData(array: Uint8Array): void
}

export interface AudioNodeLike {
  connect(destination: unknown): unknown
  disconnect(): void
}

export interface GainNodeLike extends AudioNodeLike {
  gain: { value: number }
}

export interface AudioContextLike {
  state: string
  destination: unknown
  createAnalyser(): AnalyserLike
  createGain(): GainNodeLike
  createMediaElementSource(element: HTMLMediaElement): AudioNodeLike
  createMediaStreamSource(stream: MediaStream): AudioNodeLike
  resume(): Promise<void>
  close(): Promise<void>
}

export interface LevelEnv {
  /** A new context, or null where there is no Web Audio. */
  createContext: () => AudioContextLike | null
}

export function browserLevelEnv(): LevelEnv {
  return {
    createContext: () => {
      const Context =
        typeof window === "undefined"
          ? undefined
          : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      return Context ? (new Context() as unknown as AudioContextLike) : null
    },
  }
}

/** What the voice is coming from: an `<audio>` element that plays, or a microphone stream that records. */
export type LevelSource = HTMLMediaElement | MediaStream | null

interface Tap {
  analyser: AnalyserLike
  buffer: Uint8Array
  /** Where the spectrum is read into: one buffer, reused every frame. */
  spectrum: Uint8Array
  /** The volume stage between the analyser and the speakers (an element's graph only), or null. */
  gain: GainNodeLike | null
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))

/** What the player reads from a voice: how loud it is, its spectrum, and a way to set how loud it comes out. */
export interface AudioGraph {
  /** How loud the voice is right now, 0 to 1 (see `audio-level`). Always 0 while there is nothing to listen to. */
  level: () => number
  /** The spectrum of the voice right now (`getByteFrequencyData`), in a buffer that is reused, or null while nothing listens. */
  spectrum: () => Uint8Array | null
  /**
   * Sets how loud an element's voice comes out, 0 to 1. It goes through a Web Audio gain node once the graph exists
   * (iOS Safari ignores `HTMLMediaElement.volume`), and through the element's own volume until then, or where there
   * is no Web Audio. It is remembered, so a voice that starts playing later comes out at it.
   */
  setVolume: (volume: number) => void
}

const isElement = (source: HTMLMediaElement | MediaStream): source is HTMLMediaElement =>
  typeof HTMLMediaElement !== "undefined" && source instanceof HTMLMediaElement

/**
 * Listens to a voice with a Web Audio `AnalyserNode` and answers, through the handle it returns, how loud it is right
 * now (0 to 1, see `audio-level`), what its spectrum looks like, and lets the caller set the volume it comes out at.
 * The handle and its functions are stable and cheap, so an animation loop can call them every frame without any React
 * state.
 *
 *  - An `<audio>` element is wired element, analyser, gain, speakers. Once an element feeds a graph its sound only
 *    comes out through it, so that chain is built once per element and kept for as long as the hook lives. The
 *    analyser sits before the gain: the bars and the orb show the voice, not the volume knob. The element must be
 *    same-origin or CORS-enabled (`crossOrigin="anonymous"`), or the browser hands the analyser silence.
 *  - A microphone stream is wired stream, analyser only: never to the speakers, or the visitor would hear themselves.
 *
 * The context is made when the voice first needs listening to (after a tap, so autoplay rules allow it) and is
 * closed when the hook unmounts. Where Web Audio is missing, or the graph cannot be built, the level is 0.
 */
export function useAudioGraph(source: LevelSource, active: boolean, env?: LevelEnv): AudioGraph {
  const [environment] = useState<LevelEnv>(() => env ?? browserLevelEnv())
  const context = useRef<AudioContextLike | null>(null)
  /** One tap per element: a media element can be wired into a graph only once. */
  const elementTaps = useRef(new WeakMap<HTMLMediaElement, Tap>())
  const current = useRef<Tap | null>(null)
  const volume = useRef(1)
  const listening = useRef<LevelSource>(null)

  /** Puts the remembered volume where it takes effect: the gain node if the element has one, else the element itself. */
  const applyVolume = useCallback(() => {
    const element = listening.current
    if (!element || !isElement(element)) return
    const gain = elementTaps.current.get(element)?.gain
    if (gain) {
      gain.gain.value = volume.current
      element.volume = 1
    } else {
      element.volume = volume.current
    }
  }, [])

  useEffect(() => {
    current.current = null
    if (!source || !active) return

    context.current ??= environment.createContext()
    const audio = context.current
    if (!audio) return
    if (audio.state === "suspended") void audio.resume().catch(() => undefined)

    let teardown: (() => void) | undefined
    try {
      if (isElement(source)) {
        let tap = elementTaps.current.get(source)
        if (!tap) {
          const analyser = audio.createAnalyser()
          const gain = audio.createGain()
          const node = audio.createMediaElementSource(source)
          node.connect(analyser)
          analyser.connect(gain)
          gain.connect(audio.destination)
          tap = {
            analyser,
            buffer: new Uint8Array(analyser.fftSize),
            spectrum: new Uint8Array(analyser.frequencyBinCount),
            gain,
          }
          elementTaps.current.set(source, tap)
        }
        current.current = tap
      } else {
        const analyser = audio.createAnalyser()
        const node = audio.createMediaStreamSource(source)
        node.connect(analyser)
        current.current = {
          analyser,
          buffer: new Uint8Array(analyser.fftSize),
          spectrum: new Uint8Array(analyser.frequencyBinCount),
          gain: null,
        }
        teardown = () => {
          node.disconnect()
          analyser.disconnect()
        }
      }
    } catch {
      current.current = null
    }

    return () => {
      current.current = null
      teardown?.()
    }
  }, [source, active, environment])

  // After the graph effect: whichever way the voice is wired (or not), the remembered volume lands where it counts.
  useEffect(() => {
    listening.current = source
    applyVolume()
  }, [source, active, applyVolume])

  useEffect(
    () => () => {
      const audio = context.current
      context.current = null
      if (audio) void audio.close().catch(() => undefined)
    },
    [],
  )

  return useMemo<AudioGraph>(
    () => ({
      level: () => {
        const tap = current.current
        if (!tap) return 0
        tap.analyser.getByteTimeDomainData(tap.buffer)
        return levelFromRms(byteRms(tap.buffer))
      },
      spectrum: () => {
        const tap = current.current
        if (!tap) return null
        tap.analyser.getByteFrequencyData(tap.spectrum)
        return tap.spectrum
      },
      setVolume: (next) => {
        volume.current = clamp01(next)
        applyVolume()
      },
    }),
    [applyVolume],
  )
}

/** Just how loud a voice is (see {@link useAudioGraph}): a stable function, 0 to 1, safe to call every frame. */
export function useAudioLevel(source: LevelSource, active: boolean, env?: LevelEnv): () => number {
  return useAudioGraph(source, active, env).level
}
