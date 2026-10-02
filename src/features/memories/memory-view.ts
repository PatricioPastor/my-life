/** What the browser gets for one memory: no handle, no public id, just what the space shows. */
export interface MemoryView {
  id: string
  caption: string
  /** `YYYY-MM-DD`, the calendar date it happened. */
  happenedOn: string
  /**
   * `HH:MM`, the local wall-clock time it happened, or null when it was not given (no time zone: it reads the same
   * everywhere). The server always sends it; it is optional so older DTOs and fixtures stay valid, like `photo`.
   */
  happenedTime?: string | null
  /** `pending` only ever appears for the visitor's own memories. */
  status: "approved" | "pending"
  /** The photo's size, or null when the memory has no photo (it is only an audio). */
  width: number | null
  height: number | null
  /**
   * Always `"image"`: the kind is derived, not stored. A memory has a photo when `thumbUrl` is set, and a voice when
   * `audio` is.
   */
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
  /**
   * The memory this one was contributed from, only when the reader may see that memory too (a visible one from the same
   * list): an id the reader cannot open is never sent. The constellation draws it as a strong link.
   */
  relatedId: string | null
  /** `#rrggbb`: the color the memory's orb glows in. Always valid, and always light enough for the dark void. */
  orbColor: string
  /** How many distinct visitors have opened it. Only the number: who they are never leaves the server. */
  viewCount: number
  /** Null when there is no photo. */
  thumbUrl: string | null
  fullUrl: string | null
  /**
   * The photo at the sizes it is shown at: signed, face-aware square crops (one per rung of the width ladder, never
   * upscaled), so the canvas fetches what a diameter x DPR needs and the orb and the glass show the same crop.
   * Additive: `thumbUrl` and `fullUrl` are unchanged. The server always sends it for a photo (null for a voice only);
   * it is optional so older DTOs and fixtures stay valid, and clients fall back to `thumbUrl` and `fullUrl`.
   */
  photo?: MemoryPhoto | null
  /** The voice of the memory, or null when it has none. */
  audio: MemoryAudio | null
}

/** Signed square crops of a photo, ascending by width. */
export interface MemoryPhoto {
  sizes: readonly PhotoSize[]
}

/** One square crop: `width` px on each side, at a signed delivery URL. */
export interface PhotoSize {
  width: number
  url: string
}

/** A playable audio: our own route, which streams an mp3 with byte ranges, and how long it lasts. */
export interface MemoryAudio {
  url: string
  durationMs: number
}

/** A coarse position (2 decimals), the place name and the street address, when it has them. */
export interface MemoryPlace {
  lat: number
  lng: number
  name: string | null
  /** "Av. Rivadavia 1234, Junín": the visible form of the exact position, which never leaves the server. */
  address: string | null
}

export type MemoriesFailure = "no_session" | "unavailable"

export type ListMemoriesResult = { ok: true; memories: MemoryView[] } | { ok: false; reason: MemoriesFailure }
