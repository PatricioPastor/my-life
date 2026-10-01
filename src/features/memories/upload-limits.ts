/** What a visitor may upload, shared by the browser (to refuse early) and the server (to enforce). */

/** The most a photo may weigh. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** Cloudinary format names (JPEG is `jpg` there). */
export const ALLOWED_FORMATS = ["jpg", "png", "webp", "heic", "heif"] as const
/** The signed `allowed_formats` upload parameter. */
export const ALLOWED_FORMATS_PARAM = ALLOWED_FORMATS.join(",")

/** The most an audio may weigh. */
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024

/** The longest an audio may be (the recorder stops here too). */
export const MAX_AUDIO_MS = 2 * 60 * 1000
/** A recorder's clock drifts a little past its cap; the server forgives up to this much before it refuses. */
export const AUDIO_DURATION_TOLERANCE_MS = 1000

/** Cloudinary format names for audio, which it stores as `video` resources (webm and mp4 included: MediaRecorder's). */
export const AUDIO_FORMATS = ["webm", "ogg", "opus", "mp3", "m4a", "mp4", "aac", "wav"] as const
/** The signed `allowed_formats` upload parameter of an audio. */
export const AUDIO_FORMATS_PARAM = AUDIO_FORMATS.join(",")
/**
 * The formats the server accepts when it reads an audio back: the uploadable ones plus `mka`, the name Cloudinary's
 * Admin API gives a webm that holds only audio (observed on a Chrome MediaRecorder recording). Never signed.
 */
export const AUDIO_STORED_FORMATS = [...AUDIO_FORMATS, "mka"] as const

/** Every memory photo and audio lives under this folder; the public id carries the whole path. */
export const MEMORY_FOLDER = "my-life/memories"

/** How many memories one visitor may add in a rolling window. */
export const RATE_LIMIT = { max: 5, windowMs: 24 * 60 * 60 * 1000 } as const

/** How long an upload ticket stays valid. */
export const TICKET_TTL_SECONDS = 15 * 60

const AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/opus",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  // Some systems label an audio-only webm or ogg as video.
  "video/webm",
  "video/ogg",
]
const AUDIO_EXTENSIONS = ["webm", "ogg", "oga", "opus", "mp3", "m4a", "mp4", "aac", "wav"]

const MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]
const EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif"]

export type PhotoCheck = "ok" | "too_large" | "unsupported_type"

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? ""

/**
 * Client-side pre-check of a picked file. Browsers often report no type for HEIC, so the extension decides
 * only when the type is missing or generic. The server verifies the real asset again.
 */
export function checkPhoto(file: { name: string; type: string; size: number }): PhotoCheck {
  const typeKnown = file.type !== "" && file.type !== "application/octet-stream"
  const typeOk = typeKnown ? MIME_TYPES.includes(file.type) : EXTENSIONS.includes(extensionOf(file.name))
  if (!typeOk || file.size <= 0) return "unsupported_type"
  return file.size > MAX_UPLOAD_BYTES ? "too_large" : "ok"
}

export type AudioCheck = "ok" | "too_large" | "unsupported_type"

/**
 * Client-side pre-check of a recorded or picked audio, by type (parameters such as `;codecs=opus` are ignored) and
 * size. The duration is checked apart (it needs decoding), and the server verifies the real asset again.
 */
export function checkAudio(file: { name: string; type: string; size: number }): AudioCheck {
  const type = file.type.split(";")[0].trim().toLowerCase()
  const typeKnown = type !== "" && type !== "application/octet-stream"
  const typeOk = typeKnown ? AUDIO_MIME_TYPES.includes(type) : AUDIO_EXTENSIONS.includes(extensionOf(file.name))
  if (!typeOk || file.size <= 0) return "unsupported_type"
  return file.size > MAX_AUDIO_BYTES ? "too_large" : "ok"
}
