import "server-only"
import type { AssetInfo, CloudinaryAssets } from "./cloudinary-assets"

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
    const segments = publicId.split("/")
    if (segments.some((s) => s === "" || s === "." || s === "..")) throw new Error("Invalid Cloudinary public id.")
    const path = segments.map(encodeURIComponent).join("/")
    const response = await this.fetchFn(
      `${API}/${encodeURIComponent(this.config.cloudName)}/resources/image/${DELIVERY_TYPE}/${path}?media_metadata=true&colors=true`,
      { headers: this.headers() },
    )
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Cloudinary describe failed (${response.status}).`)
    return toAssetInfo(await response.json())
  }

  async destroy(publicId: string): Promise<void> {
    const body = new URLSearchParams()
    body.append("public_ids[]", publicId)
    body.append("invalidate", "true")
    const response = await this.fetchFn(`${API}/${encodeURIComponent(this.config.cloudName)}/resources/image/${DELIVERY_TYPE}`, {
      method: "DELETE",
      headers: { ...this.headers(), "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })
    if (!response.ok) throw new Error(`Cloudinary destroy failed (${response.status}).`)
  }
}
