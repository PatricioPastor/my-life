import {
  ALLOWED_FORMATS,
  AUDIO_DURATION_TOLERANCE_MS,
  AUDIO_STORED_FORMATS,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_MS,
  MAX_UPLOAD_BYTES,
  MEMORY_FOLDER,
} from "./upload-limits"

/** What Cloudinary reports about a stored asset (Admin API "get resource"). */
export interface AssetInfo {
  publicId: string
  resourceType: string
  /** Delivery type. Photos are `authenticated`: `upload` is public, so its original (EXIF and GPS) would be too. */
  type: string
  format: string
  bytes: number
  width: number
  height: number
  /** Embedded EXIF, IPTC and XMP, read from the original. Raw and sensitive (GPS): never log or send it. */
  imageMetadata?: Record<string, unknown>
  /** Cloudinary's `colors`: `[hex, share]` pairs. Raw; `photo-details` sanitizes it. */
  colors?: unknown
}

/** What Cloudinary reports about a stored audio (Admin API "get resource", resource type `video`). */
export interface AudioInfo {
  publicId: string
  resourceType: string
  /** Delivery type. Audio is `authenticated` like the photos: it is only ever played through a signed URL. */
  type: string
  format: string
  bytes: number
  /** Seconds, as Cloudinary measured them; null when it did not say. */
  durationSeconds: number | null
  /** True for a file with no picture stream: a video renamed to `.webm` is not an audio. */
  isAudio: boolean
}

/** Port: the Cloudinary calls the server makes. The adapter is the only code that touches the network. */
export interface CloudinaryAssets {
  /** The asset, or null when it does not exist. Throws when Cloudinary cannot answer. */
  describe(publicId: string): Promise<AssetInfo | null>
  /** Deletes the asset and its CDN copies. Throws when Cloudinary cannot do it. */
  destroy(publicId: string): Promise<void>
  /** The audio (a `video` resource), or null when it does not exist. Throws when Cloudinary cannot answer. */
  describeAudio(publicId: string): Promise<AudioInfo | null>
  /** Deletes the audio and its CDN copies. Throws when Cloudinary cannot do it. */
  destroyAudio(publicId: string): Promise<void>
}

export type AssetProblem = "asset_missing" | "asset_type" | "asset_too_large"

/**
 * Whether a stored asset is the photo the ticket promised: an image of ours, in our folder, with an
 * allowed format and within the size limit. Pure; the width and height it returns come from Cloudinary.
 */
export function verifyAsset(
  info: AssetInfo | null,
  publicId: string,
): { ok: true; width: number; height: number } | { ok: false; problem: AssetProblem } {
  if (!info || info.publicId !== publicId || !publicId.startsWith(`${MEMORY_FOLDER}/`)) {
    return { ok: false, problem: "asset_missing" }
  }
  if (info.resourceType !== "image" || info.type !== "authenticated") return { ok: false, problem: "asset_type" }
  if (!(ALLOWED_FORMATS as readonly string[]).includes(info.format.toLowerCase())) {
    return { ok: false, problem: "asset_type" }
  }
  if (info.bytes > MAX_UPLOAD_BYTES) return { ok: false, problem: "asset_too_large" }
  if (!Number.isInteger(info.width) || info.width <= 0 || !Number.isInteger(info.height) || info.height <= 0) {
    return { ok: false, problem: "asset_type" }
  }
  return { ok: true, width: info.width, height: info.height }
}

export type AudioProblem = "audio_missing" | "audio_type" | "audio_too_large" | "audio_too_long"

/**
 * Whether a stored asset is the audio the ticket promised: audio of ours, in our folder, `authenticated`, in an
 * allowed format, within 15 MB and 2 minutes. Pure; the duration, size and format it returns come from Cloudinary.
 */
export function verifyAudio(
  info: AudioInfo | null,
  publicId: string,
): { ok: true; durationMs: number; bytes: number; format: string } | { ok: false; problem: AudioProblem } {
  if (!info || info.publicId !== publicId || !publicId.startsWith(`${MEMORY_FOLDER}/`)) {
    return { ok: false, problem: "audio_missing" }
  }
  const format = info.format.toLowerCase()
  if (info.resourceType !== "video" || info.type !== "authenticated" || !info.isAudio) {
    return { ok: false, problem: "audio_type" }
  }
  if (!(AUDIO_STORED_FORMATS as readonly string[]).includes(format)) return { ok: false, problem: "audio_type" }
  const seconds = info.durationSeconds
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return { ok: false, problem: "audio_type" }
  if (info.bytes > MAX_AUDIO_BYTES) return { ok: false, problem: "audio_too_large" }
  const durationMs = Math.round(seconds * 1000)
  if (durationMs > MAX_AUDIO_MS + AUDIO_DURATION_TOLERANCE_MS) return { ok: false, problem: "audio_too_long" }
  return { ok: true, durationMs, bytes: info.bytes, format }
}
