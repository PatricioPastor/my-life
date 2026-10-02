import { isWallClockTime } from "./memory"

const DATE_FORMAT = new Intl.DateTimeFormat("es", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

/** "12 de marzo de 2024". Memories carry a calendar date stored as UTC midnight, so it is read in UTC. */
export function formatMemoryDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso))
}

/**
 * "12 de marzo de 2024 · 18:42": the date, then the time it happened when the memory has one. The time is a wall clock
 * (`HH:MM`, no time zone), shown as it was written; anything else is left out.
 */
export function formatMemoryWhen(happenedOn: string, happenedTime?: string | null): string {
  const date = formatMemoryDate(happenedOn)
  return isWallClockTime(happenedTime) ? `${date} · ${happenedTime}` : date
}

/** Shortens a caption to at most `max` characters, at a word boundary when it can, ending in an ellipsis. */
export function truncateCaption(caption: string, max: number): string {
  const text = caption.replace(/\s+/g, " ").trim()
  if (text.length <= max) return text
  const head = text.slice(0, max - 1)
  const cut = /\s/.test(text[max - 1]) ? head : head.slice(0, Math.max(head.lastIndexOf(" "), 0) || head.length)
  return `${cut.trimEnd()}…`
}
