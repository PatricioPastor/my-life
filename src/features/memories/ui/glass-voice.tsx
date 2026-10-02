"use client"

import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties } from "react"
import type { MemoryView } from "../memory-view"
import { smoothedReader } from "./audio-level"
import { AUDIO_READINESS_COPY, useAudioReadiness } from "./audio-readiness"
import { AudioScrubber } from "./audio-scrubber"
import { FrequencyBars } from "./frequency-bars"
import type { LensGeometry } from "./glass-layout"
import { effectiveVolume, rememberVolume, wantsToggle, type VolumePref } from "./player-model"
import { useAudioGraph } from "./use-audio-level"
import { VolumeControl } from "./volume-control"

const PlayIcon = () => (
  <svg width="22" height="22" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M5 3.2v11.6L15 9z" fill="currentColor" />
  </svg>
)
const PauseIcon = () => (
  <svg width="22" height="22" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M4.5 3h3.4v12H4.5zM10.1 3h3.4v12h-3.4z" fill="currentColor" />
  </svg>
)

type VoiceStatus = "idle" | "playing" | "error"
type VoiceStyle = CSSProperties & Record<`--${string}`, string | number>

/** The bars sit in the lower part of the sphere, under the play button: this far down, this wide, this tall (of its diameter). */
const BARS_TOP = 0.25
const BARS_WIDTH = 0.6
const BARS_HEIGHT = 0.12
/** The controls under the sphere on a wide screen: as wide as the sphere (and a bit more), within these limits (CSS px). */
const ROW_MIN = 380
const ROW_MAX = 480
/** On a phone the controls take the width of the screen (less its margins) up to this. */
const STACK_MAX = 420

/**
 * The voice of a memory: its audio, a play button at the center of the sphere over a contrast scrim, live frequency bars
 * under it, and under the sphere a seekable progress with the time and the volume. It also hands the glass the level it
 * reads every frame. Space or K plays and pauses while the view is open.
 */
export function GlassVoice({
  memory,
  geometry,
  open,
  reduced,
  onLevel,
  onPlaying,
}: {
  memory: MemoryView
  geometry: LensGeometry
  open: boolean
  reduced: boolean
  onLevel: (level: () => number) => void
  /** Told when the voice starts and stops playing (and false when this voice goes away), for what is thrown off the orb. */
  onPlaying: (playing: boolean) => void
}) {
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  const [status, setStatus] = useState<VoiceStatus>("idle")
  // How far it has played (whole seconds), for the scrubber and its time.
  const [played, setPlayed] = useState(0)
  const [volume, setVolume] = useState<VolumePref>(() => rememberVolume())
  const root = useRef<HTMLDivElement>(null)
  // The element itself, for the one thing a handler must write to it (the seek).
  const element = useRef<HTMLAudioElement | null>(null)
  // The same listener and the same smoothing as the form's talking orb, so the voice looks alike in both places.
  const graph = useAudioGraph(audio, status === "playing")
  const level = useMemo(() => smoothedReader(graph.level), [graph])
  useEffect(() => onLevel(level), [level, onLevel])
  const playingNow = status === "playing"
  useEffect(() => {
    onPlaying(playingNow)
    return () => onPlaying(false)
  }, [playingNow, onPlaying])
  useEffect(() => graph.setVolume(effectiveVolume(volume)), [graph, volume])
  // The voice stops when the memory does: on another memory, on close, on leaving.
  useEffect(() => {
    if (!open) audio?.pause()
  }, [open, audio])
  useEffect(() => {
    const el = audio
    return () => el?.pause()
  }, [audio])

  // The audio is made in the background after the upload: until the route answers it, the control only says so.
  const readiness = useAudioReadiness(memory.audio?.url ?? null).status
  const failed = status === "error" || readiness === "unavailable"
  const processing = readiness === "processing"
  const waiting = processing || readiness === "checking"
  const label = failed
    ? AUDIO_READINESS_COPY.unavailable
    : processing
      ? AUDIO_READINESS_COPY.processing
      : status === "playing"
        ? "Pausar audio"
        : "Reproducir audio"

  const toggle = () => {
    if (!audio) return
    if (status === "playing") audio.pause()
    else audio.play().catch(() => setStatus("error"))
  }
  const seek = (seconds: number) => {
    if (!element.current) return
    element.current.currentTime = seconds
    setPlayed(Math.floor(seconds))
  }
  const changeVolume = (next: VolumePref) => setVolume(rememberVolume(next))

  // Space or K plays and pauses from anywhere in the open glass, except where typing or a slider owns the key.
  const playable = open && audio !== null && !failed && !waiting
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || !wantsToggle(event)) return
    const dialog = root.current?.closest('[role="dialog"]')
    if (!dialog || !(event.target instanceof Node) || !dialog.contains(event.target)) return
    event.preventDefault()
    toggle()
  })
  useEffect(() => {
    if (!playable) return
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [playable])

  if (!memory.audio) return null
  const { diameter, center } = geometry
  const total = memory.audio.durationMs / 1000
  // On a phone the progress has a row of its own across the screen, and the volume another under it.
  const stacked = geometry.player > 60
  const rowWidth = stacked ? STACK_MAX : Math.min(Math.max(Math.round(diameter * 1.25), ROW_MIN), ROW_MAX)
  const playing = status === "playing"
  return (
    <>
      {/* A round darkening inside the sphere, so the play button and the bars read over any photo. A radial gradient that
          fades out before its own edge: never a square, never a hard rim. Darker at rest, lighter while it plays. */}
      <span
        data-glass-scrim
        data-state={playing ? "playing" : "idle"}
        aria-hidden="true"
        className="mem-glass-scrim pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: center.x, top: center.y, width: diameter, height: diameter } as VoiceStyle}
      />
      <FrequencyBars
        graph={graph}
        playing={playing}
        reduced={reduced}
        className="mem-glass-bars pointer-events-none absolute flex -translate-x-1/2 items-center justify-between"
        style={
          {
            left: center.x,
            top: Math.round(center.y + diameter * BARS_TOP),
            width: Math.round(diameter * BARS_WIDTH),
            height: Math.round(diameter * BARS_HEIGHT),
            "--pc": memory.orbColor,
          } as VoiceStyle
        }
      />
      <div
        ref={root}
        data-glass-voice
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: center.x, top: center.y }}
      >
        <button
          type="button"
          disabled={failed || waiting}
          aria-pressed={failed || processing ? undefined : playing}
          aria-label={label}
          data-magnetic="light"
          data-cursor-label={playing ? "Pausar" : "Escuchar"}
          data-state={status}
          className="mem-glass-play mem-glass-ctl press pointer-events-auto flex size-16 items-center justify-center rounded-full text-ink"
          style={{ "--pc": memory.orbColor } as CSSProperties}
          onClick={toggle}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>
      {/* Under the sphere: progress and volume. A drag on them is not a swipe, so it never reaches the dialog's swipe. */}
      <div
        data-glass-player
        data-stacked={stacked || undefined}
        className={`pointer-events-auto absolute flex -translate-x-1/2 ${stacked ? "flex-col" : "h-12 items-center gap-1"}`}
        style={{ left: center.x, top: Math.round(center.y + diameter / 2 + 4), width: `min(calc(100% - 2rem), ${rowWidth}px)`, "--pc": memory.orbColor } as VoiceStyle}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {processing ? (
          <span role="status" className="w-full text-center text-xs tracking-[0.08em] text-ink-muted">
            {AUDIO_READINESS_COPY.processing}
          </span>
        ) : (
          <>
            <div data-glass-row className={stacked ? "flex h-11 items-center gap-1" : "flex h-12 min-w-0 flex-1 items-center gap-1"}>
              <AudioScrubber elapsed={played} total={total} disabled={failed || waiting} onSeek={seek} />
            </div>
            {!stacked ? <VolumeControl pref={volume} onChange={changeVolume} /> : (
              <div data-glass-row className="flex h-11 items-center justify-center gap-1">
                <VolumeControl pref={volume} onChange={changeVolume} stacked />
              </div>
            )}
          </>
        )}
      </div>
      {readiness === "ready" && (
        // Same origin now (our audio route), so `crossOrigin` is harmless; it keeps Web Audio able to read it either way.
        <audio
          ref={(el) => {
            element.current = el
            setAudio(el)
          }}
          src={memory.audio.url}
          crossOrigin="anonymous"
          preload="metadata"
          onPlay={() => setStatus("playing")}
          onPause={() => setStatus((s) => (s === "error" ? s : "idle"))}
          onTimeUpdate={(event) => setPlayed(Math.floor(event.currentTarget.currentTime))}
          onEnded={() => {
            setStatus("idle")
            setPlayed(0)
          }}
          onError={() => setStatus("error")}
        />
      )}
    </>
  )
}
