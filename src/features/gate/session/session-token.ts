import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"
import { isValidHandle } from "../handle"

/** `h` is the normalized handle; `exp` is expiry in unix seconds. */
export interface SessionPayload {
  h: string
  exp: number
}

const BASE64URL = /^[A-Za-z0-9_-]+$/

function mac(encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(encodedPayload).digest()
}

/** Token: `base64url(JSON payload).base64url(HMAC-SHA256(encoded payload, secret))`. */
export function signSession(payload: SessionPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify({ h: payload.h, exp: payload.exp })).toString("base64url")
  return `${encoded}.${mac(encoded, secret).toString("base64url")}`
}

function isPayload(value: unknown): value is SessionPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const keys = Object.keys(value)
  if (keys.length !== 2 || !keys.includes("h") || !keys.includes("exp")) return false
  const { h, exp } = value as Record<string, unknown>
  return typeof h === "string" && isValidHandle(h) && typeof exp === "number" && Number.isInteger(exp)
}

/** Returns the payload of a genuine, unexpired token, otherwise null. `now` is unix seconds. */
export function verifySession(token: string, secret: string, now: number): SessionPayload | null {
  if (typeof token !== "string") return null
  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [encoded, signature] = parts
  if (!BASE64URL.test(encoded) || !BASE64URL.test(signature)) return null

  const expected = mac(encoded, secret)
  const given = Buffer.from(signature, "base64url")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (!isPayload(payload) || payload.exp <= now) return null
  return payload
}
