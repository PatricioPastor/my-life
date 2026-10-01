import { CAPTION_MAX_LENGTH, EARLIEST_MEMORY_DATE } from "../memory"
import { checkPhoto } from "../upload-limits"
import type { CreateMemoryResult, PrepareUploadFailure } from "../upload-view"

/** The form's Spanish copy (neutral, `tú`). Short and honest. */
export const COPY = {
  photoSize: "La foto supera los 10 MB.",
  photoType: "Elige una foto JPG, PNG, WebP o HEIC.",
  caption: "Escribe entre 1 y 140 caracteres.",
  dateFuture: "La fecha no puede ser futura.",
  dateInvalid: "Elige una fecha entre 1900 y hoy.",
  rateLimited: "Ya agregaste 5 recuerdos hoy. Vuelve mañana.",
  unavailable: "No pudimos guardar tu recuerdo. Intenta de nuevo más tarde.",
  noSession: "Vuelve a entrar con tu usuario para agregar recuerdos.",
} as const

export interface FormErrors {
  photo?: string
  caption?: string
  date?: string
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

interface FormValues {
  file: { name: string; type: string; size: number } | null
  caption: string
  /** `YYYY-MM-DD` or empty. */
  date: string
  /** `YYYY-MM-DD`, the visitor's local today. */
  today: string
}

/** The same rules the server enforces, so mistakes are caught before anything is uploaded. */
export function validateForm({ file, caption, date, today }: FormValues): FormErrors {
  const errors: FormErrors = {}
  const check = file ? checkPhoto(file) : "unsupported_type"
  if (check === "unsupported_type") errors.photo = COPY.photoType
  else if (check === "too_large") errors.photo = COPY.photoSize

  const length = [...caption.trim()].length
  if (length < 1 || length > CAPTION_MAX_LENGTH) errors.caption = COPY.caption

  if (!DAY.test(date) || date < EARLIEST_DAY) errors.date = COPY.dateInvalid
  else if (date > today) errors.date = COPY.dateFuture
  return errors
}

type Failure = Extract<CreateMemoryResult, { ok: false }> | { ok: false; reason: PrepareUploadFailure }

/** Where a failed save shows up: on the field it is about, or on the form. */
export function messageForFailure(failure: Failure): FormErrors {
  if (failure.reason === "invalid" && "errors" in failure) {
    const errors: FormErrors = {}
    for (const error of failure.errors) {
      if (error === "caption_empty" || error === "caption_too_long") errors.caption = COPY.caption
      else if (error === "date_in_future") errors.date = COPY.dateFuture
      else if (error === "date_invalid" || error === "date_too_old") errors.date = COPY.dateInvalid
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
    default:
      return { form: COPY.unavailable }
  }
}
