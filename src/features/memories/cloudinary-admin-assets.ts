import "server-only"
import type { AssetInfo, AudioInfo, CloudinaryAssets } from "./cloudinary-assets"

export interface CloudinaryConfig {
  cloudName: string
  apiKey: string
  apiSecret: string
}

const API = "https://api.cloudinary.com/v1_1"
/** The delivery type photos are uploaded as: it is part of every Admin API resource path. */
const DELIVERY_TYPE = "authenticated"

/** The three variables, or null when any is missing: the feature is then unavailable. */
export function readCloudinaryConfig(env: Record<string, string | undefined> = process.env): CloudinaryConfig | null {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim()
  const apiKey = env.CLOUDINARY_API_KEY?.trim()
  const apiSecret = env.CLOUDINARY_API_SECRET?.trim()
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null
}

type Fetch = typeof fetch

function recordOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function toAssetInfo(body: unknown): AssetInfo {
  const b = body as Record<string, unknown> | null
  if (
    !b ||
    typeof b.public_id !== "string" ||
    typeof b.resource_type !== "string" ||
    typeof b.type !== "string" ||
    typeof b.format !== "string" ||
    typeof b.bytes !== "number" ||
    typeof b.width !== "number" ||
    typeof b.height !== "number"
  ) {
    throw new Error("Cloudinary answered with an unexpected shape.")
  }
  return {
    publicId: b.public_id,
    resourceType: b.resource_type,
    type: b.type,
    format: b.format,
    bytes: b.bytes,
    width: b.width,
    height: b.height,
    // The key is `image_metadata` in the documented upload answer and `media_metadata` in some others.
    imageMetadata: recordOrUndefined(b.image_metadata ?? b.media_metadata),
    colors: b.colors,
  }
}

function durationOf(b: Record<string, unknown>): number | null {
  const nested = recordOrUndefined(b.video_metadata)?.duration
  const seconds = typeof b.duration === "number" ? b.duration : nested
  return typeof seconds === "number" ? seconds : null
}

/**
 * Whether Cloudinary says the asset has no picture. The Admin API nests its stream details in `video_metadata`
 * (observed on a Chrome recording: `is_audio`, `audio`, an empty `video`), while a `is_audio` at the top is the
 * upload answer's shape; both are read, an explicit flag winning. With no flag, an audio stream and no video
 * stream (no `video_codec`, no non-empty `video`) is audio.
 */
function isAudioOf(b: Record<string, unknown>): boolean {
  const nested = recordOrUndefined(b.video_metadata)
  if (typeof b.is_audio === "boolean") return b.is_audio
  if (typeof nested?.is_audio === "boolean") return nested.is_audio
  const hasAudio = b.has_audio === true || nested?.has_audio === true || recordOrUndefined(b.audio ?? nested?.audio) !== undefined
  const video = recordOrUndefined(b.video ?? nested?.video)
  const hasVideo = typeof b.video_codec === "string" || (video !== undefined && Object.keys(video).length > 0)
  return hasAudio && !hasVideo
}

function toAudioInfo(body: unknown): AudioInfo {
  const b = body as Record<string, unknown> | null
  if (
    !b ||
    typeof b.public_id !== "string" ||
    typeof b.resource_type !== "string" ||
    typeof b.type !== "string" ||
    typeof b.format !== "string" ||
    typeof b.bytes !== "number"
  ) {
    throw new Error("Cloudinary answered with an unexpected shape.")
  }
  return {
    publicId: b.public_id,
    resourceType: b.resource_type,
    type: b.type,
    format: b.format,
    bytes: b.bytes,
    durationSeconds: durationOf(b),
    isAudio: isAudioOf(b),
  }
}

/** A public id as URL path segments (folder slashes kept), refusing anything that could walk out of its path. */
function encodedPath(publicId: string): string {
  const segments = publicId.split("/")
  if (segments.some((s) => s === "" || s === "." || s === "..")) throw new Error("Invalid Cloudinary public id.")
  return segments.map(encodeURIComponent).join("/")
}

/**
 * Adapter over Cloudinary's Admin API (plain `fetch`, no SDK). The API secret stays in here: it goes out only
 * as the basic-auth header of a request to Cloudinary. Errors carry the status code, never the response body.
 */
export class CloudinaryAdminAssets implements CloudinaryAssets {
  constructor(
    private readonly config: CloudinaryConfig,
    private readonly fetchFn: Fetch = fetch,
  ) {}

  private headers(): Record<string, string> {
    const { apiKey, apiSecret } = this.config
    return { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}` }
  }

  async describe(publicId: string): Promise<AssetInfo | null> {
    const path = encodedPath(publicId)
    const response = await this.fetchFn(
      `${API}/${encodeURIComponent(this.config.cloudName)}/resources/image/${DELIVERY_TYPE}/${path}?media_metadata=true&colors=true`,
      { headers: this.headers() },
    )
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Cloudinary describe failed (${response.status}).`)
    return toAssetInfo(await response.json())
  }

  async describeAudio(publicId: string): Promise<AudioInfo | null> {
    const path = encodedPath(publicId)
    // Audio is a `video` resource. `media_metadata` also asks for the stream details (duration, codecs).
    const response = await this.fetchFn(
      `${API}/${encodeURIComponent(this.config.cloudName)}/resources/video/${DELIVERY_TYPE}/${path}?media_metadata=true`,
      { headers: this.headers() },
    )
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Cloudinary describe failed (${response.status}).`)
    return toAudioInfo(await response.json())
  }

  private async destroyResource(resourceType: "image" | "video", publicId: string): Promise<void> {
    const body = new URLSearchParams()
    body.append("public_ids[]", publicId)
    body.append("invalidate", "true")
    const response = await this.fetchFn(
      `${API}/${encodeURIComponent(this.config.cloudName)}/resources/${resourceType}/${DELIVERY_TYPE}`,
      {
        method: "DELETE",
        headers: { ...this.headers(), "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
    )
    if (!response.ok) throw new Error(`Cloudinary destroy failed (${response.status}).`)
  }

  destroy(publicId: string): Promise<void> {
    return this.destroyResource("image", publicId)
  }

  destroyAudio(publicId: string): Promise<void> {
    return this.destroyResource("video", publicId)
  }
}
