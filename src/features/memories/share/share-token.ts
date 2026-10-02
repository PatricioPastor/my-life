import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"

// Domain separation: a session cookie or an upload ticket, signed with the same secret, can never verify as a share
// token (and the other way round), because the MAC covers this prefix.
const DOMAIN = "share:v1:"
const MAC_BYTES = 16
const ID_BYTES = 16
const BASE64URL = /^[A-Za-z0-9_-]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// 16 bytes are 22 base64url characters, without padding.
const PART_LENGTH = 22

const mac = (id: string, secret: string): Buffer =>
  createHmac("sha256", secret).update(`${DOMAIN}${id}`).digest().subarray(0, MAC_BYTES)

const toUuid = (hex: string) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`

/**
 * The link token of a memory: `base64url(id, 16 bytes).base64url(HMAC-SHA256(secret, "share:v1:" + id), first 16 bytes)`.
 * Stateless: nothing is stored, so it needs no database write and cannot expire; a link stops working when the memory
 * stops being approved (or when the secret is rotated). 128 bits of MAC are plenty against forging.
 */
export function signShareToken(memoryId: string, secret: string): string {
  if (!UUID.test(memoryId)) throw new Error("A share token needs a memory uuid.")
  const id = memoryId.toLowerCase()
  const raw = Buffer.from(id.replaceAll("-", ""), "hex")
  return `${raw.toString("base64url")}.${mac(id, secret).toString("base64url")}`
}

/** The memory id of a genuine token (always lowercase), otherwise null. The compare is constant-time. */
export function verifyShareToken(token: string, secret: string): string | null {
  if (typeof token !== "string") return null
  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [encodedId, signature] = parts
  if (encodedId.length !== PART_LENGTH || signature.length !== PART_LENGTH) return null
  if (!BASE64URL.test(encodedId) || !BASE64URL.test(signature)) return null

  const raw = Buffer.from(encodedId, "base64url")
  const given = Buffer.from(signature, "base64url")
  if (raw.length !== ID_BYTES || given.length !== MAC_BYTES) return null

  const id = toUuid(raw.toString("hex"))
  return timingSafeEqual(given, mac(id, secret)) ? id : null
}
