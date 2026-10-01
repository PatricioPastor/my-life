/** What the browser gets for one memory: no handle, no public id, just what the space shows. */
export interface MemoryView {
  id: string
  caption: string
  /** `YYYY-MM-DD`, the calendar date it happened. */
  happenedOn: string
  /** `pending` only ever appears for the visitor's own memories. */
  status: "approved" | "pending"
  width: number
  height: number
  kind: "image"
  /** ISO 8601 UTC from the photo's EXIF, or null when unknown. */
  takenAt: string | null
  /** `#rrggbb`, or null. */
  dominantColor: string | null
  thumbUrl: string
  fullUrl: string
}

export type MemoriesFailure = "no_session" | "unavailable"

export type ListMemoriesResult = { ok: true; memories: MemoryView[] } | { ok: false; reason: MemoriesFailure }
