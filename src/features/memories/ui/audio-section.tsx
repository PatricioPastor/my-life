"use client"

import { useId, useState, type ChangeEvent } from "react"
import { cn } from "@/shared/lib/utils"
import { MAX_AUDIO_MS } from "../upload-limits"
import { RECORDER_COPY, formatBytes, formatClock, recordingNotice } from "./audio-recorder-model"
import { TalkingOrb } from "./talking-orb"
import { useAudioLevel, type LevelEnv } from "./use-audio-level"
import type { useAudioRecorder } from "./use-audio-recorder"

/** The audio section's Spanish copy (neutral, `tú`). */
export const AUDIO_COPY = {
  label: "Audio",
  hint: "Hasta 60 minutos. Para audios largos usa MP3, M4A u OGG; un WAV de una hora es demasiado pesado.",
  requesting: "Esperando el micrófono…",
  recording: "Grabando…",
} as const

const ACCEPT = "audio/*,.webm,.ogg,.oga,.opus,.mp3,.m4a,.mp4,.aac,.wav"
const RIM = "border border-[#a8c8ff]/25"
const LABEL_CLASS = "t-label text-ink-muted"
const ERROR_CLASS = "t-body m-0 text-[length:var(--type-1)] leading-snug text-signal"
const BUTTON_CLASS =
  "press t-label inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-sm border border-[#a8c8ff]/35 bg-[#a8c8ff]/[0.06] px-4 text-[#eaf0ff] transition-colors duration-200 hover:bg-[#a8c8ff]/[0.14] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8c8ff] disabled:opacity-50"
const ICON_CLASS =
  "press inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors duration-200 hover:text-[#eaf0ff] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#a8c8ff] disabled:opacity-50"

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
  /** A seam for tests: the Web Audio the talking orb listens through. */
  levelEnv?: LevelEnv
}

const MicIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <rect x="5" y="1" width="4" height="7" rx="2" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2.5 7a4.5 4.5 0 0 0 9 0M7 11.5V13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)
const PlayIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
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
 * "Audio": record the voice of a memory or upload a file, and listen to it before saving. Idle it offers Grabar (where
 * the browser can record) and Subir audio; recording it shows the time against the 60 minute cap, the size so far and, from 55 minutes, a quiet warning and a talking orb that
 * listens to the microphone; holding an audio it plays it back with the same orb, in the memory's color, pulsing with the
 * voice. The box keeps its height through every state, so nothing below it jumps. Presentational: the form owns the
 * recorder (`useAudioRecorder`) and the checks.
 */
export function AudioSection({ recorder, color, disabled, error, onPickFile, levelEnv }: AudioSectionProps) {
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

  const status = asking ? AUDIO_COPY.requesting : recording ? AUDIO_COPY.recording : ""
  // Close to the cap: how long is left. Quiet (a status, not an alert): the recording carries on.
  const notice = recording ? recordingNotice(state.elapsedMs) : null

  return (
    <div
      role="group"
      aria-labelledby={`${fileId}-label`}
      aria-describedby={[hintId, problem && errorId].filter(Boolean).join(" ")}
      className="flex flex-col gap-2"
    >
      <span id={`${fileId}-label`} className={LABEL_CLASS}>
        {AUDIO_COPY.label}
      </span>

      <div
        data-testid="audio-box"
        className={cn(RIM, "flex min-h-[4.5rem] flex-wrap items-center gap-x-3 gap-y-1 rounded-sm bg-white/[0.03] px-3 py-2")}
      >
        {(recording || held) && (
          <TalkingOrb color={color} level={level} active={talking} size={26} className="-mx-1.5" />
        )}

        {recording && (
          <>
            <span role="timer" aria-label="Tiempo grabado" className="t-body min-w-0 flex-1 text-[length:var(--type-1)] whitespace-nowrap tabular-nums text-ink">
              {formatClock(state.elapsedMs)} / {formatClock(MAX_AUDIO_MS)}
              <span className="text-ink-muted"> · ~{formatBytes(sizeBytes ?? 0)}</span>
            </span>
            <button type="button" onClick={stop} className={BUTTON_CLASS} data-magnetic="light" data-cursor-label="Detener">
              <StopIcon />
              Detener
            </button>
            <button
              type="button"
              onClick={discard}
              aria-label="Quitar audio"
              data-magnetic="light"
              data-cursor-label="Quitar audio"
              className={ICON_CLASS}
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
              className={cn(BUTTON_CLASS, "w-11 rounded-full px-0")}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <span className="t-body flex min-w-0 flex-1 flex-col text-[length:var(--type-1)] leading-tight text-ink">
              {state.durationMs !== null && <span className="tabular-nums">{formatClock(state.durationMs)}</span>}
              {state.source === "file" && <span className="max-w-full truncate text-xs tracking-[0.04em] text-ink-muted">{clip.name}</span>}
            </span>
            {supported && (
              <button
                type="button"
                onClick={() => void start()}
                disabled={disabled}
                aria-label="Grabar de nuevo"
                data-magnetic="light"
                data-cursor-label="Grabar de nuevo"
                className={ICON_CLASS}
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
              className={ICON_CLASS}
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
                className={BUTTON_CLASS}
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
                BUTTON_CLASS,
                "cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#a8c8ff]",
                (disabled || asking) && "pointer-events-none opacity-50",
              )}
            >
              Subir audio
            </label>
          </>
        )}
      </div>

      {status && (
        <p role="status" className="m-0 text-xs tracking-[0.04em] text-ink-muted">
          {status}
        </p>
      )}
      {notice && (
        <p role="status" className="m-0 text-xs tracking-[0.04em] text-ink">
          {notice}
        </p>
      )}
      <p id={hintId} className="m-0 text-xs tracking-[0.04em] text-ink-muted">
        {unsupported ? RECORDER_COPY.errors.unsupported : AUDIO_COPY.hint}
      </p>
      {problem && (
        <p id={errorId} role="alert" className={ERROR_CLASS}>
          {problem}
        </p>
      )}
    </div>
  )
}
