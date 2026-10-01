import {
  CAPTION_MAX_LENGTH,
  EARLIEST_MEMORY_DATE,
  type MemoryCore,
  type NewMemoryInput,
} from "./memory"

export type MemoryValidationError =
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

  const publicId = input.publicId.trim()
  if (publicId === "") errors.push("public_id_empty")

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

  if (!isPositiveInteger(input.width)) errors.push("width_invalid")
  if (!isPositiveInteger(input.height)) errors.push("height_invalid")

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: { publicId, caption, happenedOn, width: input.width, height: input.height },
  }
}
