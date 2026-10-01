import { ALLOWED_FORMATS, MAX_UPLOAD_BYTES, MEMORY_FOLDER } from "./upload-limits"

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

/** Port: the Cloudinary calls the server makes. The adapter is the only code that touches the network. */
export interface CloudinaryAssets {
  /** The asset, or null when it does not exist. Throws when Cloudinary cannot answer. */
  describe(publicId: string): Promise<AssetInfo | null>
  /** Deletes the asset and its CDN copies. Throws when Cloudinary cannot do it. */
  destroy(publicId: string): Promise<void>
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
