import "server-only"
import { createHash } from "node:crypto"

const BASE = "https://res.cloudinary.com"

/** Square, face-aware crop: what a point shows on hover. */
export const THUMB_TRANSFORM = "f_auto,q_auto,c_fill,g_auto,w_160,h_160"
/** The viewer's photo: never upscaled, never wider than 1600 px. */
export const FULL_TRANSFORM = "f_auto,q_auto,c_limit,w_1600"

/**
 * The link preview of a shared photo: 1200x630 (the Open Graph size), face-aware, always a jpg, because the crawlers
 * behind link previews (chat apps, social networks) do not all read webp or avif.
 */
export const OG_TRANSFORM = "f_jpg,q_auto,c_fill,g_auto,w_1200,h_630"

/** From this side up the crop is shown up close (the approach and the glass), so it asks for the best quality. */
const BEST_QUALITY_FROM = 768

/**
 * A face-aware square crop of an exact side: the size ladder of the canvas. The orb, the approach and the glass all
 * show the same crop, so nothing re-frames as the camera comes in. The caller never asks for more than the photo's
 * shorter side (see `deliverySides`), so `c_fill` never upscales.
 */
export function squareTransform(side: number): string {
  if (!Number.isInteger(side) || side <= 0) throw new Error("A square side must be a positive whole number of pixels.")
  const quality = side >= BEST_QUALITY_FROM ? "q_auto:best" : "q_auto"
  return `f_auto,${quality},c_fill,g_auto,w_${side},h_${side}`
}

/**
 * An audio plays in every browser as mp3, whatever the visitor recorded (Safari and iOS cannot play webm or opus).
 * The format rides in the signed transformation, so the signature covers it.
 */
export const AUDIO_TRANSFORM = "f_mp3"

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

function signedUrl(
  resourceType: "image" | "video",
  cloudName: string,
  publicId: string,
  transform: string,
  apiSecret: string,
): string {
  if (!cloudName) throw new Error("Cloudinary cloud name is required.")
  if (!apiSecret) throw new Error("Cloudinary API secret is required to sign delivery URLs.")
  const segments = publicId.split("/")
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    throw new Error("Invalid Cloudinary public id.")
  }
  const path = segments.map(encodeURIComponent).join("/")
  const signature = signDeliveryPath(transform, path, apiSecret)
  return `${BASE}/${encodeURIComponent(cloudName)}/${resourceType}/authenticated/${signature}/${transform}/${path}`
}

/**
 * A signed Cloudinary delivery URL of the `authenticated` type, built by hand: no SDK and no network. Photos are
 * uploaded as `authenticated`, so the untransformed original (which keeps its EXIF, GPS included) cannot be
 * fetched without a signature, and the signature covers the transformation: dropping it breaks the URL. Public id
 * segments are encoded one by one so folder slashes survive, and `.`/`..`/empty segments are refused so an id can
 * never walk out of its path. The API secret only goes into the hash, never into the URL.
 */
export function cloudinaryUrl(cloudName: string, publicId: string, transform: string, apiSecret: string): string {
  return signedUrl("image", cloudName, publicId, transform, apiSecret)
}

/**
 * The signed URL an audio is played from: the `authenticated` `video` type, transcoded to mp3 (`AUDIO_TRANSFORM`),
 * built the same way as {@link cloudinaryUrl}.
 */
export function cloudinaryAudioUrl(cloudName: string, publicId: string, apiSecret: string): string {
  return signedUrl("video", cloudName, publicId, AUDIO_TRANSFORM, apiSecret)
}
