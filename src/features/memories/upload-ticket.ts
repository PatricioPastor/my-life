import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"
import { MEMORY_FOLDER } from "./upload-limits"

/** `h` is the visitor's handle, `pid` the public id the server chose, `exp` expiry in unix seconds. */
export interface UploadTicket {
  h: string
  pid: string
  exp: number
}

const BASE64URL = /^[A-Za-z0-9_-]+$/
// Domain separation: a session cookie, signed with the same secret, can never verify as a ticket.
const DOMAIN = "upload-ticket:"

const mac = (encoded: string, secret: string) => createHmac("sha256", secret).update(`${DOMAIN}${encoded}`).digest()

/** Token: `base64url(JSON payload).base64url(HMAC-SHA256(domain + encoded payload, secret))`, like the session. */
export function signUploadTicket(ticket: UploadTicket, secret: string): string {
  const encoded = Buffer.from(JSON.stringify({ h: ticket.h, pid: ticket.pid, exp: ticket.exp })).toString("base64url")
  return `${encoded}.${mac(encoded, secret).toString("base64url")}`
}

function isTicket(value: unknown): value is UploadTicket {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const keys = Object.keys(value).sort()
  if (keys.join() !== "exp,h,pid") return false
  const { h, pid, exp } = value as Record<string, unknown>
  return (
    typeof h === "string" &&
    h !== "" &&
    typeof pid === "string" &&
    pid.startsWith(`${MEMORY_FOLDER}/`) &&
    typeof exp === "number" &&
    Number.isInteger(exp)
  )
}

/** The ticket of a genuine, unexpired token, otherwise null. `now` is unix seconds. */
export function verifyUploadTicket(token: string, secret: string, now: number): UploadTicket | null {
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
  if (!isTicket(payload) || payload.exp <= now) return null
  return payload
}
