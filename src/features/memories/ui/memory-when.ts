import { EARLIEST_MEMORY_DATE, isWallClockTime } from "../memory"

/**
 * "¿Cuándo fue?" filled in by itself. Each source the form knows (the photo, the recording, the audio file, the memory
 * it is contributed from) offers a date and maybe a time; the fields show the visitor's own edit, field by field, or
 * else the best source's. Everything here is pure: the form keeps the candidates and the edits, and asks again on render,
 * so removing a photo or an audio recomputes the fields by itself.
 */

/** A moment as the form's two fields hold it: the local calendar date and, when known, the wall-clock time. */
export interface When {
  /** `YYYY-MM-DD`. */
  date: string
  /** `HH:MM` (24 h), or null when only the day is known. */
  time: string | null
}

/**
 * Where an automatic date and time can come from, best first: the photo's EXIF (the camera's own clock), the moment a
 * recording started, an uploaded audio file's date (only approximate: when the file last changed), and the date of the
 * related memory (a day, no time).
 */
export const WHEN_SOURCES = ["photo", "recording", "file", "related"] as const
export type WhenSource = (typeof WHEN_SOURCES)[number]

/** Each source's own date and time; an absent or null one has nothing to offer. */
export type WhenCandidates = Partial<Record<WhenSource, When | null>>

/** What the visitor typed in each field. A field they never touched is absent; one they cleared is "". */
export interface WhenOverrides {
  date?: string
  time?: string
}

/** The copy of the date and time fields (neutral Spanish, `tú`): the time's name and the line that says where they came from. */
export const WHEN_COPY = {
  time: "Hora",
  hints: {
    photo: "Desde tu foto",
    recording: "Cuando empezaste a grabar",
    file: "Según el archivo de audio",
    related: "Igual que el recuerdo relacionado",
  },
} as const satisfies { time: string; hints: Record<WhenSource, string> }

/** What the two fields show. */
export interface ShownWhen {
  /** `YYYY-MM-DD`, or "" when there is none yet. */
  date: string
  /** `HH:MM`, or "" when there is none. */
  time: string
  /** The source of what is shown; null when nothing automatic is shown (none found, or the visitor edited a field). */
  source: WhenSource | null
  /** The shown date only approximates the moment: an audio file's date is when the file last changed. */
  approximate: boolean
  /** The one-line hint under the fields, or null. */
  hint: string | null
}

/**
 * The fields' values: the visitor's own edit of each field when there is one (even an empty one), else the best
 * candidate's date and time. The hint says where they came from, and goes once the visitor edits either field.
 */
export function deriveWhen(candidates: WhenCandidates, overrides: WhenOverrides): ShownWhen {
  const best = WHEN_SOURCES.find((source) => candidates[source]) ?? null
  const auto = best ? candidates[best] : null
  const edited = overrides.date !== undefined || overrides.time !== undefined
  const source = edited ? null : best
  return {
    date: overrides.date ?? auto?.date ?? "",
    time: overrides.time ?? auto?.time ?? "",
    source,
    approximate: source === "file",
    hint: source ? WHEN_COPY.hints[source] : null,
  }
}

const pad = (n: number) => String(n).padStart(2, "0")
const DAY = /^\d{4}-\d{2}-\d{2}$/
const EARLIEST_DAY = EARLIEST_MEMORY_DATE.toISOString().slice(0, 10)

/** True for a `YYYY-MM-DD` that is a real calendar day. */
function isCalendarDay(value: string): boolean {
  if (!DAY.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/**
 * The local date and wall-clock time of a moment, to the minute: a Date, or milliseconds like `File.lastModified`.
 * Null for an invalid moment, and for 0 or less (a file whose date is not known).
 */
export function localWhen(moment: Date | number): (When & { time: string }) | null {
  if (typeof moment === "number" && !(moment > 0)) return null
  const date = typeof moment === "number" ? new Date(moment) : moment
  if (Number.isNaN(date.getTime())) return null
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  }
}

/**
 * The candidate when it can be offered: a real calendar day (and a valid `HH:MM`, when it has a time), not before
 * 1900-01-01 (the oldest date a memory can have) and not later than `now` on the visitor's clock. Anything else is
 * ignored, so a camera with a wrong clock never fills the form with a date it would refuse.
 */
export function usableWhen(candidate: When | null | undefined, now: Date): When | null {
  if (!candidate || !isCalendarDay(candidate.date)) return null
  if (candidate.time !== null && !isWallClockTime(candidate.time)) return null
  if (candidate.date < EARLIEST_DAY) return null
  const current = localWhen(now)
  if (!current) return null
  if (candidate.date > current.date) return null
  if (candidate.date === current.date && candidate.time !== null && candidate.time > current.time) return null
  return { date: candidate.date, time: candidate.time }
}
