import "server-only"
import { createHash } from "node:crypto"

export type SignatureAlgorithm = "sha1" | "sha256"

/** `name=value` pairs sorted by name and joined with `&`; empty values are left out. */
export function serializeParams(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((key) => params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&")
}

/**
 * Cloudinary's upload signature: the sorted params, the API secret appended with no separator, hashed (hex).
 * Sign every field of the POST except `file`, `cloud_name`, `resource_type` and `api_key`. Cloudinary accepts
 * SHA-1 and SHA-256 digests by default; SHA-256 is ours.
 */
export function signCloudinaryParams(
  params: Record<string, string>,
  apiSecret: string,
  algorithm: SignatureAlgorithm = "sha256",
): string {
  return createHash(algorithm).update(`${serializeParams(params)}${apiSecret}`).digest("hex")
}
