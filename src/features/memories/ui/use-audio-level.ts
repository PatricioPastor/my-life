"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { byteRms, levelFromRms } from "./audio-level"

/** The parts of the Web Audio API this hook uses, so a test can stand in for them. */
export interface AnalyserLike {
  fftSize: number
  connect(destination: unknown): unknown
  disconnect(): void
  getByteTimeDomainData(array: Uint8Array): void
}

export interface AudioNodeLike {
  connect(destination: unknown): unknown
  disconnect(): void
}

export interface AudioContextLike {
  state: string
  destination: unknown
  createAnalyser(): AnalyserLike
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
}

const isElement = (source: HTMLMediaElement | MediaStream): source is HTMLMediaElement =>
  typeof HTMLMediaElement !== "undefined" && source instanceof HTMLMediaElement

/**
 * Listens to a voice with a Web Audio `AnalyserNode` and answers, through the function it returns, how loud it is
 * right now (0 to 1, see `audio-level`). The function is stable and cheap, so an animation loop can call it every
 * frame without any React state.
 *
 *  - An `<audio>` element is wired element, analyser, speakers. Once an element feeds a graph its sound only comes out
 *    through it, so that chain is built once per element and kept for as long as the hook lives. The element must be
 *    same-origin or CORS-enabled (`crossOrigin="anonymous"`), or the browser hands the analyser silence.
 *  - A microphone stream is wired stream, analyser only: never to the speakers, or the visitor would hear themselves.
 *
 * The context is made when the voice first needs listening to (after a tap, so autoplay rules allow it) and is
 * closed when the hook unmounts. Where Web Audio is missing, or the graph cannot be built, the level is 0.
 */
export function useAudioLevel(source: LevelSource, active: boolean, env?: LevelEnv): () => number {
  const [environment] = useState<LevelEnv>(() => env ?? browserLevelEnv())
  const context = useRef<AudioContextLike | null>(null)
  /** One tap per element: a media element can be wired into a graph only once. */
  const elementTaps = useRef(new WeakMap<HTMLMediaElement, Tap>())
  const current = useRef<Tap | null>(null)

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
          const node = audio.createMediaElementSource(source)
          node.connect(analyser)
          analyser.connect(audio.destination)
          tap = { analyser, buffer: new Uint8Array(analyser.fftSize) }
          elementTaps.current.set(source, tap)
        }
        current.current = tap
      } else {
        const analyser = audio.createAnalyser()
        const node = audio.createMediaStreamSource(source)
        node.connect(analyser)
        current.current = { analyser, buffer: new Uint8Array(analyser.fftSize) }
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

  useEffect(
    () => () => {
      const audio = context.current
      context.current = null
      if (audio) void audio.close().catch(() => undefined)
    },
    [],
  )

  return useCallback(() => {
    const tap = current.current
    if (!tap) return 0
    tap.analyser.getByteTimeDomainData(tap.buffer)
    return levelFromRms(byteRms(tap.buffer))
  }, [])
}
