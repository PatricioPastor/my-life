import "server-only"
import type { CloudinaryConfig } from "./cloudinary-admin-assets"
import { signCloudinaryParams } from "./cloudinary-signature"
import type { MemoryRepository } from "./memory-repository"
import type { PrepareUploadResult } from "./upload-view"
import { signUploadTicket } from "./upload-ticket"
import { ALLOWED_FORMATS_PARAM, MEMORY_FOLDER, RATE_LIMIT, TICKET_TTL_SECONDS } from "./upload-limits"

export interface PrepareUploadDeps {
  currentVisitor: () => Promise<{ handle: string } | null>
  /** Lazy, so building it (which runs the runtime-role guard) happens inside the failure handling. */
  repository: () => MemoryRepository
  /** Null when a Cloudinary variable is missing. */
  cloudinary: CloudinaryConfig | null
  /** The HMAC secret for tickets (SESSION_SECRET); null when not configured. */
  ticketSecret: string | null
  /** Milliseconds, like `Date.now`. */
  now: () => number
  /** A fresh random id, like `crypto.randomUUID`. */
  newId: () => string
  /** One short line, never with personal data. */
  log: (message: string) => void
}

/**
 * Authorizes one direct browser upload: the visitor must have a session and be under the rate limit. The
 * server picks the public id and signs it with the upload parameters (the browser can change none of them),
 * and hands back a ticket that `createMemory` later checks. The API secret never leaves this function.
 */
export async function prepareUploadWith(deps: PrepareUploadDeps): Promise<PrepareUploadResult> {
  try {
    const visitor = await deps.currentVisitor()
    if (!visitor) return { ok: false, reason: "no_session" }
    if (!deps.cloudinary || !deps.ticketSecret) {
      deps.log("Cloudinary or the session secret is not configured.")
      return { ok: false, reason: "unavailable" }
    }

    const nowMs = deps.now()
    const recent = await deps.repository().countRecentBy(visitor.handle, new Date(nowMs - RATE_LIMIT.windowMs))
    if (recent >= RATE_LIMIT.max) return { ok: false, reason: "rate_limited" }

    const timestamp = Math.floor(nowMs / 1000)
    const publicId = `${MEMORY_FOLDER}/${deps.newId()}`
    // `overwrite=false` so a signature that outlives the ticket cannot replace the photo after approval.
    const signed = {
      allowed_formats: ALLOWED_FORMATS_PARAM,
      overwrite: "false",
      public_id: publicId,
      timestamp: String(timestamp),
    }
    const { cloudName, apiKey, apiSecret } = deps.cloudinary
    const signature = signCloudinaryParams(signed, apiSecret)
    const ticket = signUploadTicket(
      { h: visitor.handle, pid: publicId, exp: timestamp + TICKET_TTL_SECONDS },
      deps.ticketSecret,
    )
    return { ok: true, upload: { cloudName, fields: { ...signed, api_key: apiKey, signature }, ticket } }
  } catch (error) {
    // The name only: messages from the database layer can carry query parameters.
    deps.log(`Preparing an upload failed (${error instanceof Error ? error.name : "unknown"}).`)
    return { ok: false, reason: "unavailable" }
  }
}
