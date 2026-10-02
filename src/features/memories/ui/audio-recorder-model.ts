import { MAX_AUDIO_MS } from "../upload-limits"

/**
 * The recorder as a state machine, kept pure so it is tested without a microphone: idle, asking for the microphone,
 * recording, recorded (a recording or an uploaded file is held) and playing it back. The browser side effects
 * (getUserMedia, MediaRecorder, the timer) live in `use-audio-recorder`, which only feeds events in.
 */

export type RecorderPhase = "idle" | "requesting" | "recording" | "recorded" | "playing"

/** Why recording did not start or did not finish. */
export type RecorderError = "denied" | "no_device" | "unsupported" | "failed"

export interface RecorderState {
  phase: RecorderPhase
  /** Time recorded so far, while recording (0 otherwise). Never more than the cap. */
  elapsedMs: number
  /** How long the held audio lasts; null when it is not known yet (an uploaded file the browser cannot measure). */
  durationMs: number | null
  /** Whether the held audio was recorded here or picked as a file. */
  source: "recording" | "file" | null
  error: RecorderError | null
}

export type RecorderEvent =
  | { type: "request" }
  | { type: "started" }
  | { type: "tick"; elapsedMs: number }
  | { type: "stopped"; durationMs: number }
  | { type: "failed"; error: RecorderError }
  | { type: "loaded"; durationMs: number | null }
  | { type: "play" }
  | { type: "pause" }
  | { type: "ended" }
  | { type: "discard" }

export const INITIAL_RECORDER: RecorderState = { phase: "idle", elapsedMs: 0, durationMs: null, source: null, error: null }

export function recorderReducer(state: RecorderState, event: RecorderEvent): RecorderState {
  switch (event.type) {
    case "request":
      // Recording again over a held audio starts over; a request while asking or recording changes nothing.
      return state.phase === "requesting" || state.phase === "recording" ? state : { ...INITIAL_RECORDER, phase: "requesting" }
    case "started":
      return state.phase === "requesting" ? { ...INITIAL_RECORDER, phase: "recording" } : state
    case "tick":
      return state.phase === "recording"
        ? { ...state, elapsedMs: Math.min(MAX_AUDIO_MS, Math.max(state.elapsedMs, event.elapsedMs)) }
        : state
    case "stopped":
      return state.phase === "recording"
        ? { phase: "recorded", elapsedMs: 0, durationMs: Math.min(MAX_AUDIO_MS, event.durationMs), source: "recording", error: null }
        : state
    case "failed":
      return { ...INITIAL_RECORDER, error: event.error }
    case "loaded":
      return state.phase === "requesting" || state.phase === "recording"
        ? state
        : { phase: "recorded", elapsedMs: 0, durationMs: event.durationMs, source: "file", error: null }
    case "play":
      return state.phase === "recorded" ? { ...state, phase: "playing" } : state
    case "pause":
    case "ended":
      return state.phase === "playing" ? { ...state, phase: "recorded" } : state
    case "discard":
      return INITIAL_RECORDER
  }
}

/** The error a failed `getUserMedia` call means, from its DOMException name. */
export function errorFromName(name: string | undefined): RecorderError {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return "denied"
    case "NotFoundError":
    case "OverconstrainedError":
    case "DevicesNotFoundError":
      return "no_device"
    default:
      return "failed"
  }
}

/** Best first: webm with opus is what Chrome, Firefox, Edge and recent Safari record; older Safari and iOS only mp4. */
const PREFERRED_MIMES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"]

/**
 * The first container the browser says it can record (`MediaRecorder.isTypeSupported`), or undefined to let the
 * browser pick its own default. Never throws.
 */
export function pickRecorderMime(isSupported: ((type: string) => boolean) | undefined): string | undefined {
  if (!isSupported) return undefined
  try {
    return PREFERRED_MIMES.find((type) => isSupported(type))
  } catch {
    return undefined
  }
}

/** A file name for a recording, with the extension of its container (Cloudinary reads the format from the content, but a name helps). */
export function fileNameFor(mime: string): string {
  const type = mime.split(";")[0].trim().toLowerCase()
  const extension = type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : type === "audio/wav" ? "wav" : "webm"
  return `recuerdo.${extension}`
}

/** How long before the cap the recorder starts to say how much time is left: five minutes. */
export const RECORDER_WARN_AT_MS = MAX_AUDIO_MS - 5 * 60 * 1000

/**
 * The quiet line shown while recording close to the cap, or null before it: the minutes left and that the recording
 * stops by itself. Not an error: the recording goes on.
 */
export function recordingNotice(elapsedMs: number): string | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < RECORDER_WARN_AT_MS) return null
  const remainingMs = Math.max(MAX_AUDIO_MS - elapsedMs, 0)
  const left = remainingMs <= 60_000 ? "Queda menos de 1 min." : `Quedan ${Math.ceil(remainingMs / 60_000)} min.`
  return `${left} La grabación se detendrá sola a los ${MAX_AUDIO_MS / 60_000} minutos.`
}

/** An approximate size for the recording so far, in decimal KB or MB like Cloudinary counts them. */
export function formatBytes(bytes: number): string {
  const value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  return value >= 1_000_000 ? `${Math.round(value / 1_000_000)} MB` : `${Math.round(value / 1000)} KB`
}

/** `m:ss`, rounding down. */
export function formatClock(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

/** The recorder's Spanish copy (neutral, `tú`). Short and honest. */
export const RECORDER_COPY = {
  errors: {
    denied: "No pudimos usar el micrófono. Permite el acceso o sube un archivo de audio.",
    no_device: "No encontramos un micrófono. Sube un archivo de audio.",
    unsupported: "Tu navegador no puede grabar. Sube un archivo de audio.",
    failed: "No pudimos grabar. Intenta de nuevo o sube un archivo de audio.",
  },
} as const satisfies { errors: Record<RecorderError, string> }
