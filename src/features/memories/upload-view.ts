import type { MemoryValidationError } from "./validate-new-memory"
import type { MemoryView } from "./memory-view"

/** Which assets the visitor is about to upload. At least one must be true. */
export interface PrepareUploadInput {
  photo: boolean
  audio: boolean
}

/** The signed form fields (including `api_key` and `signature`) of one upload, to be sent as they are next to the file. */
export type UploadFields = Record<string, string>

/**
 * Everything the browser needs for the direct Cloudinary uploads of one memory. No secret is ever in here. A photo
 * goes to `image/upload` with `photo`, an audio to `video/upload` with `audio` (Cloudinary stores audio as video).
 */
export interface UploadGrant {
  cloudName: string
  /** Null when no photo was asked for. */
  photo: UploadFields | null
  /** Null when no audio was asked for. */
  audio: UploadFields | null
  /** Proves to `createMemory` that the server issued these uploads to this visitor. One ticket covers every asset. */
  ticket: string
}

export type PrepareUploadFailure = "no_session" | "unavailable" | "rate_limited" | "invalid"
export type PrepareUploadResult = { ok: true; upload: UploadGrant } | { ok: false; reason: PrepareUploadFailure }

export interface CreateMemoryInput {
  ticket: string
  caption: string
  /** `YYYY-MM-DD`, the visitor calendar date. */
  happenedOn: string
  /**
   * `HH:MM` (24 h), the visitor's local wall-clock time, or null when they left it empty. Optional: the server stores it
   * as it is, with no time zone, and refuses anything that is not a valid `HH:MM`.
   */
  happenedTime?: string | null
  /**
   * The visitor ticked "Guardar dónde se sacó la foto". Only an explicit `true` counts; the server alone decides what
   * is stored (the exact location, and only when the photo has valid GPS).
   */
  shareLocation: boolean
  /**
   * A Google Maps link that corrects the place of the photo. Optional: the server re-resolves it and ignores any
   * coordinates or labels the browser may have seen.
   */
  mapsUrl?: string
  /**
   * The orb color the visitor picked from the swatches of their photo (`#rrggbb`). Optional: the server accepts it
   * only when it is a valid color that glows on the dark void, and otherwise uses the photo's dominant color.
   */
  orbColor?: string
  /**
   * The memory this one is contributed from. Optional: the server accepts it only when it is the id of an approved
   * memory the visitor can see, and otherwise drops it without failing the upload.
   */
  relatedMemoryId?: string
  /**
   * "Mismo lugar": copy the related memory's place (position, name and address), which the server reads itself.
   * Only an explicit `true` counts, and a pasted Maps link or the photo's own GPS wins over it.
   */
  samePlace?: boolean
}

export type CreateMemoryFailure =
  | "no_session"
  | "invalid_ticket"
  | "rate_limited"
  | "asset_missing"
  | "asset_type"
  | "asset_too_large"
  | "audio_missing"
  | "audio_type"
  | "audio_too_large"
  | "audio_too_long"
  | "duplicate"
  | "unavailable"

export type CreateMemoryResult =
  /** `locationSaved` is false when no place was stored (no GPS, or a link that could not be read). */
  | { ok: true; memory: MemoryView; locationSaved: boolean }
  | { ok: false; reason: "invalid"; errors: MemoryValidationError[] }
  | { ok: false; reason: CreateMemoryFailure }
