"use client"

import { useId, useState, type ChangeEvent } from "react"
import { cn } from "@/shared/lib/utils"
import { MAX_AUDIO_MS } from "../upload-limits"
import { RECORDER_COPY, formatBytes, formatClock, recordingNotice } from "./audio-recorder-model"
import { BUTTON_FACE, ERROR, HINT, PANEL } from "./sheet-styles"
import { TalkingOrb } from "./talking-orb"
import { useAudioLevel, type LevelEnv } from "./use-audio-level"
import type { useAudioRecorder } from "./use-audio-recorder"

/** The audio section's Spanish copy (neutral, `tú`). */
export const AUDIO_COPY = {
  /** The group's name for screen readers: on screen, Grabar and Subir audio say it. */
  label: "Tu voz",
  /** The real limits (`MAX_AUDIO_MS`, `MAX_AUDIO_BYTES`), and the formats that keep a long voice under the size. */
  hint: "Voz hasta 60 min y 100 MB · mejor MP3, M4A u OGG",
  requesting: "Esperando el micrófono…",
  recording: "Grabando…",
} as const

const ACCEPT = "audio/*,.webm,.ogg,.oga,.opus,.mp3,.m4a,.mp4,.aac,.wav"
/**
 * A control inside the audio panel: 44 px tall, with the inner radius (the panel's 12 minus its 4 px padding), so its
 * corners nest in the panel's. Presses down to 0.96; only the scale and the colors move.
 */
const CONTROL = cn(
  BUTTON_FACE,
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-inner text-[length:var(--type-1)] leading-none text-ink transition-[scale,background-color,color] duration-150 ease-out active:not-disabled:scale-[0.96] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#a8c8ff] disabled:opacity-50",
)
/** One half of the segmented pair, or Detener: a faint fill that brightens under the pointer. */
const SEGMENT = cn(CONTROL, "bg-white/[0.06] px-4 hover:bg-white/[0.11]")
/** A square icon control (44 px, the hit area itself). */
const ICON = cn(CONTROL, "w-11 text-ink-muted hover:bg-white/[0.08] hover:text-ink")

export interface AudioSectionProps {
  /** The recorder the form owns (state, the held clip, and the actions). */
  recorder: ReturnType<typeof useAudioRecorder>
  /** The memory's orb color, for the talking orb of the preview. */
  color: string
  /** True while the memory is being saved. */
  disabled: boolean
  /** The form's validation error for the audio, or a server one. */
  error?: string
  /** A picked audio file (the form checks it and hands it to the recorder). */
  onPickFile: (file: File | undefined) => void
  /** The group's id, so the form can move the focus into it. */
  id?: string
  /** More descriptions for the group: an error the form shows beside it. */
  describedBy?: string
  /** A seam for tests: the Web Audio the talking orb listens through. */
  levelEnv?: LevelEnv
}

const MicIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <rect x="5" y="1" width="4" height="7" rx="2" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2.5 7a4.5 4.5 0 0 0 9 0M7 11.5V13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)
const UploadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M7 9.5V1.5M3.75 4.75 7 1.5l3.25 3.25M2 12.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
// A triangle's visual centre sits left of its box's: it is nudged 1 px right so it looks centred in its button.
const PlayIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" className="translate-x-px">
    <path d="M2.5 1.5v9l8-4.5z" />
  </svg>
)
const PauseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
    <path d="M2.5 1.5h2.6v9H2.5zM6.9 1.5h2.6v9H6.9z" />
  </svg>
)
const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
const StopIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
    <rect x="2" y="2" width="8" height="8" rx="1" />
  </svg>
)

/**
 * The voice of a memory: record it or upload a file, and listen to it before saving. Every state lives in one panel
 * (the panel radius, padded by the panel padding) that keeps its height: idle it is the segmented pair Grabar | Subir
 * audio (only Subir audio where the browser cannot record); recording it shows a talking orb that listens to the
 * microphone, the time against the 60 minute cap and the size so far, Detener and Quitar; holding an audio it is a
 * player whose orb, in the memory's color, pulses with the voice. Presentational: the form owns the recorder
 * (`useAudioRecorder`) and the checks.
 */
export function AudioSection({ recorder, color, disabled, error, onPickFile, id, describedBy, levelEnv }: AudioSectionProps) {
  const { state, supported, clip, stream, sizeBytes, start, stop, discard, playback } = recorder
  const fileId = useId()
  const errorId = `${fileId}-error`
  const hintId = `${fileId}-hint`
  const [element, setElement] = useState<HTMLAudioElement | null>(null)

  const recording = state.phase === "recording"
  const playing = state.phase === "playing"
  const held = (state.phase === "recorded" || playing) && clip !== null
  const asking = state.phase === "requesting"
  const talking = recording || playing
  const level = useAudioLevel(recording ? stream : playing ? element : null, talking, levelEnv)

  const unsupported = !supported && !held && !recording
  // Where the browser cannot record at all the hint already says so; a failed attempt is an alert.
  const problem =
    error ?? (state.error && !(state.error === "unsupported" && unsupported) ? RECORDER_COPY.errors[state.error] : undefined)

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    onPickFile(event.target.files?.[0])
    // The same file can be picked again after it was removed.
    event.target.value = ""
  }

  function togglePlayback() {
    if (!element) return
    if (element.paused) void element.play().catch(() => undefined)
    else element.pause()
  }

  // Said to screen readers only: on screen the talking orb and the running time already show it.
  const status = asking ? AUDIO_COPY.requesting : recording ? AUDIO_COPY.recording : ""
  // Close to the cap: how long is left. Quiet (a status, not an alert): the recording carries on.
  const notice = recording ? recordingNotice(state.elapsedMs) : null

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={`${fileId}-label`}
      aria-describedby={[hintId, problem && errorId, describedBy].filter(Boolean).join(" ")}
      className="flex flex-col gap-2"
    >
      <span id={`${fileId}-label`} className="sr-only">
        {AUDIO_COPY.label}
      </span>

      {/* 44 px controls plus the panel padding on both sides: the same height in every state. */}
      <div
        data-testid="audio-box"
        className={cn(PANEL, "flex h-[calc(2.75rem+2*var(--panel-pad))] items-center gap-panel p-panel")}
      >
        {recording && (
          <>
            <TalkingOrb color={color} level={level} active={talking} size={22} />
            {/* Two short lines, like the player's: the time against the cap, then the size so far. */}
            <span role="timer" aria-label="Tiempo grabado" className="t-body flex min-w-0 flex-1 flex-col text-[length:var(--type-1)] leading-tight whitespace-nowrap tabular-nums text-ink">
              <span className="truncate">
                {formatClock(state.elapsedMs)} / {formatClock(MAX_AUDIO_MS)}
              </span>
              <span className="truncate text-sm text-ink-muted">~{formatBytes(sizeBytes ?? 0)}</span>
            </span>
            <button type="button" onClick={stop} className={cn(SEGMENT, "pr-4 pl-3.5")} data-magnetic="light" data-cursor-label="Detener">
              <StopIcon />
              Detener
            </button>
            <button
              type="button"
              onClick={discard}
              aria-label="Quitar audio"
              data-magnetic="light"
              data-cursor-label="Quitar audio"
              className={ICON}
            >
              <CloseIcon />
            </button>
          </>
        )}

        {held && clip && (
          <>
            {/* The clip plays from an object URL, same-origin, so the analyser can hear it. The controls are ours. */}
            <audio
              key={clip.url}
              ref={setElement}
              src={clip.url}
              preload="metadata"
              onPlay={playback.onPlay}
              onPause={playback.onPause}
              onEnded={playback.onEnded}
            />
            <button
              type="button"
              onClick={togglePlayback}
              disabled={disabled}
              aria-label={playing ? "Pausar" : "Escuchar"}
              data-magnetic="light"
              data-cursor-label={playing ? "Pausar" : "Escuchar"}
              className={cn(CONTROL, "w-11 bg-[#eaf0ff] text-[#07061a] hover:bg-white")}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <TalkingOrb color={color} level={level} active={talking} size={22} />
            <span className="t-body flex min-w-0 flex-1 flex-col text-[length:var(--type-1)] leading-tight text-ink">
              {state.durationMs !== null && <span className="tabular-nums">{formatClock(state.durationMs)}</span>}
              {state.source === "file" && <span className="max-w-full truncate text-sm text-ink-muted">{clip.name}</span>}
            </span>
            {supported && (
              <button
                type="button"
                onClick={() => void start()}
                disabled={disabled}
                aria-label="Grabar de nuevo"
                data-magnetic="light"
                data-cursor-label="Grabar de nuevo"
                className={ICON}
              >
                <MicIcon />
              </button>
            )}
            <button
              type="button"
              onClick={discard}
              disabled={disabled}
              aria-label="Quitar audio"
              data-magnetic="light"
              data-cursor-label="Quitar audio"
              className={ICON}
            >
              <CloseIcon />
            </button>
          </>
        )}

        {!recording && !held && (
          <>
            {supported && (
              <button
                type="button"
                onClick={() => void start()}
                disabled={disabled || asking}
                data-magnetic="light"
                data-cursor-label="Grabar"
                className={cn(SEGMENT, "flex-1")}
              >
                <MicIcon />
                Grabar
              </button>
            )}
            <input
              id={fileId}
              type="file"
              accept={ACCEPT}
              onChange={onFile}
              disabled={disabled || asking}
              className="peer sr-only"
            />
            <label
              htmlFor={fileId}
              data-magnetic="light"
              data-cursor-label="Subir audio"
              className={cn(
                SEGMENT,
                "flex-1 cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[-2px] peer-focus-visible:outline-[#a8c8ff]",
                (disabled || asking) && "pointer-events-none opacity-50",
              )}
            >
              <UploadIcon />
              Subir audio
            </label>
          </>
        )}
      </div>

      {status && (
        <p role="status" className="sr-only">
          {status}
        </p>
      )}
      {notice && (
        <p role="status" className={cn(HINT, "text-ink")}>
          {notice}
        </p>
      )}
      <p id={hintId} className={HINT}>
        {unsupported ? RECORDER_COPY.errors.unsupported : AUDIO_COPY.hint}
      </p>
      {problem && (
        <p id={errorId} role="alert" className={ERROR}>
          {problem}
        </p>
      )}
    </div>
  )
}
