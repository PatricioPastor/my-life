import type { LocationSource, MediaKind, MetadataValue, PaletteColor, PhotoDetails } from "./photo-details"

export type MemoryStatus = "pending" | "approved" | "rejected"

/** The audio of a memory, as stored: what Cloudinary reported about it (never what the browser said). */
export interface StoredAudio {
  /** Cloudinary public id of the audio (a `video` resource). */
  publicId: string
  /** Lowercase Cloudinary format name of the original (`webm`, `m4a`...). */
  format: string
  bytes: number
  durationMs: number
}

/** A photo and/or an audio, a short caption and the date it happened, uploaded by an admitted visitor. */
export interface Memory {
  id: string
  /** The visitor's Instagram handle (normalized). */
  handle: string
  /** Cloudinary public id of the photo; null for an audio-only memory. */
  publicId: string | null
  caption: string
  /** Calendar date the memory happened, as UTC midnight. */
  happenedOn: Date
  /** The photo's size; null when there is no photo. */
  width: number | null
  height: number | null
  status: MemoryStatus
  createdAt: Date
  kind: MediaKind
  /** Null only for rows stored before photo details existed. */
  format: string | null
  bytes: number | null
  /** When the photo was taken (EXIF); null when unknown. */
  takenAt: Date | null
  dominantColor: string | null
  palette: PaletteColor[]
  /** A whitelist of non-identifying camera fields: never GPS, serials or owner names. */
  metadata: Record<string, MetadataValue>
  /** Exact position (6 decimals), stored only when the visitor opted in. Only a 2-decimal view reaches the client. */
  latitude: number | null
  longitude: number | null
  /** Short label of the location. */
  placeName: string | null
  /** The street address of the location ("Av. Rivadavia 1234, Junín"); only with a location. */
  placeAddress: string | null
  /** Where the location came from; set if and only if the location is. */
  locationSource: LocationSource | null
  /** `#rrggbb` the orb glows in. Null only for rows stored before orb colors existed. */
  orbColor: string | null
  /** How many distinct visitors opened it (kept by the database; the visitors themselves never leave it). */
  viewCount: number
  /** The memory this one was contributed from, or null. The database only lets it point at an approved memory. */
  relatedMemoryId: string | null
  /** The voice of the memory; null for a photo-only one. */
  audio: StoredAudio | null
}

/** What a visitor submits. The handle comes from the session, never from this input. */
export interface MemoryCore {
  /** The photo's public id, or null when the memory is only an audio. */
  publicId: string | null
  caption: string
  happenedOn: Date
  width: number | null
  height: number | null
  /** At least one of `publicId` and `audio` is set. */
  audio: StoredAudio | null
}

/** Unvalidated input, same shape as {@link MemoryCore}. */
export type NewMemoryInput = MemoryCore

/**
 * What is stored for a new memory: the validated submission plus what the server learned from the photo, and the
 * orb color the server settled on (always a valid, glowing `#rrggbb`).
 */
export type NewMemory = MemoryCore & PhotoDetails & { orbColor: string; relatedMemoryId: string | null }

export const CAPTION_MAX_LENGTH = 140
export const EARLIEST_MEMORY_DATE = new Date("1900-01-01T00:00:00.000Z")
