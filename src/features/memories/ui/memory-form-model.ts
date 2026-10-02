import { CAPTION_MAX_LENGTH, EARLIEST_MEMORY_DATE, isWallClockTime } from "../memory"
import { MAX_AUDIO_MS, checkAudio, checkPhoto } from "../upload-limits"
import type { CreateMemoryResult, PrepareUploadFailure } from "../upload-view"

/** The form's Spanish copy (neutral, `tú`). Short and honest. */
export const COPY = {
  media: "Agrega una foto o un audio.",
  photoSize: "La foto supera los 10 MB.",
  photoType: "Elige una foto JPG, PNG, WebP o HEIC.",
  audioType: "Elige un audio WebM, OGG, MP3, M4A, AAC o WAV.",
  audioSize: "El audio supera los 100 MB. Para audios largos usa MP3, M4A u OGG.",
  audioLong: "El audio dura más de 60 minutos.",
  audioRecording: "Detén la grabación antes de guardar.",
  caption: "Escribe entre 1 y 140 caracteres.",
  dateFuture: "La fecha no puede ser futura.",
  dateInvalid: "Elige una fecha entre 1900 y hoy.",
  timeInvalid: "Elige una hora válida o déjala vacía.",
  rateLimited: "Ya agregaste 5 recuerdos hoy. Vuelve mañana.",
  unavailable: "No pudimos guardar tu recuerdo. Intenta de nuevo más tarde.",
  noSession: "Vuelve a entrar con tu usuario para agregar recuerdos.",
} as const

export interface FormErrors {
  /** Neither a photo nor an audio. */
  media?: string
  photo?: string
  audio?: string
  caption?: string
  date?: string
  time?: string
  /** An error about the whole submission, not one field. */
  form?: string
}

const EARLIEST_DAY = EARLIEST_MEMORY_DATE.toISOString().slice(0, 10)
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The visitor's local calendar date as `YYYY-MM-DD`: what the date input compares against. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** An audio as the form holds it: a recording or a picked file, and how long it lasts when that is known. */
export interface AudioCandidate {
  name: string
  type: string
  size: number
  durationMs: number | null
}

interface FormValues {
  file: { name: string; type: string; size: number } | null
  audio?: AudioCandidate | null
  /** A recording is still going: it has to be stopped before saving. */
  recording?: boolean
  caption: string
  /** `YYYY-MM-DD` or empty. */
  date: string
  /** `HH:MM` or empty: the time is optional. */
  time?: string
  /** `YYYY-MM-DD`, the visitor's local today. */
  today: string
}

/** The same rules the server enforces, so mistakes are caught before anything is uploaded. */
export function validateForm({ file, audio = null, recording = false, caption, date, time = "", today }: FormValues): FormErrors {
  const errors: FormErrors = {}
  // A memory is a photo, an audio or both, so neither one is required on its own.
  if (recording) errors.audio = COPY.audioRecording
  else if (!file && !audio) errors.media = COPY.media

  if (file) {
    const check = checkPhoto(file)
    if (check === "unsupported_type") errors.photo = COPY.photoType
    else if (check === "too_large") errors.photo = COPY.photoSize
  }

  if (audio && !recording) {
    const check = checkAudio(audio)
    if (check === "unsupported_type") errors.audio = COPY.audioType
    else if (check === "too_large") errors.audio = COPY.audioSize
    else if (audio.durationMs !== null && audio.durationMs > MAX_AUDIO_MS) errors.audio = COPY.audioLong
  }

  const length = [...caption.trim()].length
  if (length < 1 || length > CAPTION_MAX_LENGTH) errors.caption = COPY.caption

  if (!DAY.test(date) || date < EARLIEST_DAY) errors.date = COPY.dateInvalid
  else if (date > today) errors.date = COPY.dateFuture

  // A wall clock with no time zone: only its form is checked, and the date rules above stay the same.
  if (time !== "" && !isWallClockTime(time)) errors.time = COPY.timeInvalid
  return errors
}

type Failure = Extract<CreateMemoryResult, { ok: false }> | { ok: false; reason: PrepareUploadFailure }

/** Where a failed save shows up: on the field it is about, or on the form. */
export function messageForFailure(failure: Failure): FormErrors {
  if (failure.reason === "invalid" && "errors" in failure) {
    const errors: FormErrors = {}
    for (const error of failure.errors) {
      if (error === "media_missing") errors.media = COPY.media
      else if (error === "caption_empty" || error === "caption_too_long") errors.caption = COPY.caption
      else if (error === "date_in_future") errors.date = COPY.dateFuture
      else if (error === "date_invalid" || error === "date_too_old") errors.date = COPY.dateInvalid
      else if (error === "time_invalid") errors.time = COPY.timeInvalid
    }
    return Object.keys(errors).length > 0 ? errors : { form: COPY.unavailable }
  }
  switch (failure.reason) {
    case "rate_limited":
      return { form: COPY.rateLimited }
    case "no_session":
      return { form: COPY.noSession }
    case "asset_too_large":
      return { photo: COPY.photoSize }
    case "asset_type":
      return { photo: COPY.photoType }
    case "audio_too_large":
      return { audio: COPY.audioSize }
    case "audio_type":
      return { audio: COPY.audioType }
    case "audio_too_long":
      return { audio: COPY.audioLong }
    default:
      return { form: COPY.unavailable }
  }
}
