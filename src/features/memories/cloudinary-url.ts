import "server-only"
import { createHash } from "node:crypto"

const BASE = "https://res.cloudinary.com"

/** Square, face-aware crop: what a point shows on hover. */
export const THUMB_TRANSFORM = "f_auto,q_auto,c_fill,g_auto,w_160,h_160"
/** The viewer's photo: never upscaled, never wider than 1600 px. */
export const FULL_TRANSFORM = "f_auto,q_auto,c_limit,w_1600"

/**
 * The `s--SIGNATURE--` component of a signed delivery URL: the first 8 characters of the URL-safe base64 SHA-1 of
 * `<transformation>/<public id><API secret>` (Cloudinary, "Delivery URL signatures"). The version is not signed.
 * An empty transformation signs the bare public id, which is what a URL for the original would need.
 */
export function signDeliveryPath(transform: string, path: string, apiSecret: string): string {
  const toSign = transform ? `${transform}/${path}` : path
  const digest = createHash("sha1").update(`${toSign}${apiSecret}`).digest("base64url")
  return `s--${digest.slice(0, 8)}--`
}

/**
 * A signed Cloudinary delivery URL of the `authenticated` type, built by hand: no SDK and no network. Photos are
 * uploaded as `authenticated`, so the untransformed original (which keeps its EXIF, GPS included) cannot be
 * fetched without a signature, and the signature covers the transformation: dropping it breaks the URL. Public id
 * segments are encoded one by one so folder slashes survive, and `.`/`..`/empty segments are refused so an id can
 * never walk out of its path. The API secret only goes into the hash, never into the URL.
 */
export function cloudinaryUrl(cloudName: string, publicId: string, transform: string, apiSecret: string): string {
  if (!cloudName) throw new Error("Cloudinary cloud name is required.")
  if (!apiSecret) throw new Error("Cloudinary API secret is required to sign delivery URLs.")
  const segments = publicId.split("/")
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    throw new Error("Invalid Cloudinary public id.")
  }
  const path = segments.map(encodeURIComponent).join("/")
  const signature = signDeliveryPath(transform, path, apiSecret)
  return `${BASE}/${encodeURIComponent(cloudName)}/image/authenticated/${signature}/${transform}/${path}`
}
