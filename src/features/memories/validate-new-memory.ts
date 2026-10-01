import {
  CAPTION_MAX_LENGTH,
  EARLIEST_MEMORY_DATE,
  type MemoryCore,
  type NewMemoryInput,
} from "./memory"

export type MemoryValidationError =
  | "media_missing"
  | "audio_invalid"
  | "public_id_empty"
  | "caption_empty"
  | "caption_too_long"
  | "date_invalid"
  | "date_in_future"
  | "date_too_old"
  | "width_invalid"
  | "height_invalid"

export type ValidationResult =
  | { ok: true; value: MemoryCore }
  | { ok: false; errors: MemoryValidationError[] }

const isPositiveInteger = (n: number) => Number.isInteger(n) && n > 0

/** UTC midnight of the date's UTC calendar day. */
function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/**
 * Pure validation of a visitor's submission. Collects every error instead of stopping at the
 * first. `now` is injectable for tests; "not in the future" compares UTC calendar days, so the
 * caller should send the visitor's local calendar date as UTC midnight.
 */
export function validateNewMemory(input: NewMemoryInput, now: Date = new Date()): ValidationResult {
  const errors: MemoryValidationError[] = []

  // A memory is a photo, an audio or both; with a photo its size is known, without one it is not.
  const audio = input.audio ?? null
  let publicId: string | null = null
  if (input.publicId === null) {
    if (audio === null) errors.push("media_missing")
  } else {
    publicId = input.publicId.trim()
    if (publicId === "") errors.push("public_id_empty")
  }

  if (audio !== null) {
    const { bytes, durationMs } = audio
    if (audio.publicId.trim() === "" || !isPositiveInteger(bytes) || !isPositiveInteger(durationMs)) {
      errors.push("audio_invalid")
    }
  }

  const caption = input.caption.trim()
  if (caption === "") errors.push("caption_empty")
  // Spread counts code points, matching how Postgres counts varchar(140) characters.
  else if ([...caption].length > CAPTION_MAX_LENGTH) errors.push("caption_too_long")

  let happenedOn = input.happenedOn
  if (Number.isNaN(happenedOn.getTime())) {
    errors.push("date_invalid")
  } else {
    happenedOn = utcDay(happenedOn)
    if (happenedOn > utcDay(now)) errors.push("date_in_future")
    else if (happenedOn < EARLIEST_MEMORY_DATE) errors.push("date_too_old")
  }

  if (input.publicId === null) {
    if (input.width !== null) errors.push("width_invalid")
    if (input.height !== null) errors.push("height_invalid")
  } else {
    if (input.width === null || !isPositiveInteger(input.width)) errors.push("width_invalid")
    if (input.height === null || !isPositiveInteger(input.height)) errors.push("height_invalid")
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: { publicId, caption, happenedOn, width: input.width, height: input.height, audio },
  }
}
