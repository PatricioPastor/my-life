const BASE = "https://res.cloudinary.com"

/** Square, face-aware crop: what a point shows on hover. */
export const THUMB_TRANSFORM = "f_auto,q_auto,c_fill,g_auto,w_160,h_160"
/** The viewer's photo: never upscaled, never wider than 1600 px. */
export const FULL_TRANSFORM = "f_auto,q_auto,c_limit,w_1600"

/**
 * A Cloudinary delivery URL, built by hand: no SDK and no network. Public id segments are encoded one
 * by one so folder slashes survive, and `.`/`..`/empty segments are refused so an id can never walk
 * out of its path.
 */
export function cloudinaryUrl(cloudName: string, publicId: string, transform: string): string {
  if (!cloudName) throw new Error("Cloudinary cloud name is required.")
  const segments = publicId.split("/")
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    throw new Error("Invalid Cloudinary public id.")
  }
  const path = segments.map(encodeURIComponent).join("/")
  return `${BASE}/${encodeURIComponent(cloudName)}/image/upload/${transform}/${path}`
}
