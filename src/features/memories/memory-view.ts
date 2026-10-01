/** What the browser gets for one memory: no handle, no public id, just what the space shows. */
export interface MemoryView {
  id: string
  caption: string
  /** `YYYY-MM-DD`, the calendar date it happened. */
  happenedOn: string
  /** `pending` only ever appears for the visitor's own memories. */
  status: "approved" | "pending"
  /** Null when the memory has no photo (audio only). */
  width: number | null
  height: number | null
  kind: "image"
  /** ISO 8601 UTC from the photo's EXIF, or null when unknown. */
  takenAt: string | null
  /** `#rrggbb`, or null. */
  dominantColor: string | null
  /**
   * Where the photo was taken, only when the visitor shared it. Coarse on purpose: 2 decimals (about 1 km), enough
   * to cluster memories. The exact position never leaves the server.
   */
  place: MemoryPlace | null
  /** `#rrggbb`: the color the memory's orb glows in. Always valid, and always light enough for the dark void. */
  orbColor: string
  /** Null when the memory has no photo. */
  thumbUrl: string | null
  fullUrl: string | null
  /** The voice: a signed, playable transcode, or null when the memory has none. A memory has a photo, audio, or both. */
  audio: MemoryAudio | null
}

export interface MemoryAudio {
  url: string
  durationMs: number
}

/** A coarse position (2 decimals) and the place name, when it has one. */
export interface MemoryPlace {
  lat: number
  lng: number
  name: string | null
}

export type MemoriesFailure = "no_session" | "unavailable"

export type ListMemoriesResult = { ok: true; memories: MemoryView[] } | { ok: false; reason: MemoriesFailure }
