/** What a visitor may upload, shared by the browser (to refuse early) and the server (to enforce). */

/** The most a photo may weigh. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** Cloudinary format names (JPEG is `jpg` there). */
export const ALLOWED_FORMATS = ["jpg", "png", "webp", "heic", "heif"] as const
/** The signed `allowed_formats` upload parameter. */
export const ALLOWED_FORMATS_PARAM = ALLOWED_FORMATS.join(",")

/** Every memory photo lives under this folder; the public id carries the whole path. */
export const MEMORY_FOLDER = "my-life/memories"

/** How many memories one visitor may add in a rolling window. */
export const RATE_LIMIT = { max: 5, windowMs: 24 * 60 * 60 * 1000 } as const

/** How long an upload ticket stays valid. */
export const TICKET_TTL_SECONDS = 15 * 60

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
