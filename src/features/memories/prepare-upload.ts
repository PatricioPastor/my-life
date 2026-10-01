import "server-only"
import type { CloudinaryConfig } from "./cloudinary-admin-assets"
import { signCloudinaryParams } from "./cloudinary-signature"
import type { MemoryRepository } from "./memory-repository"
import type { PrepareUploadInput, PrepareUploadResult } from "./upload-view"
import { signUploadTicket } from "./upload-ticket"
import {
  ALLOWED_FORMATS_PARAM,
  AUDIO_FORMATS_PARAM,
  MEMORY_FOLDER,
  RATE_LIMIT,
  TICKET_TTL_SECONDS,
} from "./upload-limits"

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
 * Authorizes the direct browser uploads of one memory: the visitor must have a session and be under the rate limit.
 * For each asset asked for (a photo, an audio or both) the server picks the public id and signs it with the upload
 * parameters (the browser can change none of them), and hands back one ticket that `createMemory` later checks. The
 * API secret never leaves this function. Only an explicit `true` counts as asking: the input comes from the browser.
 */
export async function prepareUploadWith(deps: PrepareUploadDeps, input: PrepareUploadInput): Promise<PrepareUploadResult> {
  try {
    const visitor = await deps.currentVisitor()
    if (!visitor) return { ok: false, reason: "no_session" }
    const wantsPhoto = (input as Partial<PrepareUploadInput> | null | undefined)?.photo === true
    const wantsAudio = (input as Partial<PrepareUploadInput> | null | undefined)?.audio === true
    if (!wantsPhoto && !wantsAudio) return { ok: false, reason: "invalid" }
    if (!deps.cloudinary || !deps.ticketSecret) {
      deps.log("Cloudinary or the session secret is not configured.")
      return { ok: false, reason: "unavailable" }
    }

    const nowMs = deps.now()
    const recent = await deps.repository().countRecentBy(visitor.handle, new Date(nowMs - RATE_LIMIT.windowMs))
    if (recent >= RATE_LIMIT.max) return { ok: false, reason: "rate_limited" }

    const timestamp = Math.floor(nowMs / 1000)
    const { cloudName, apiKey, apiSecret } = deps.cloudinary
    const sign = (signed: Record<string, string>) => ({
      ...signed,
      api_key: apiKey,
      signature: signCloudinaryParams(signed, apiSecret),
    })

    // `overwrite=false` so a signature that outlives the ticket cannot replace the asset after approval.
    // `authenticated`: the untransformed original (a photo keeps its EXIF and GPS) is not publicly fetchable.
    let photoId: string | undefined
    let photo: Record<string, string> | null = null
    if (wantsPhoto) {
      photoId = `${MEMORY_FOLDER}/${deps.newId()}`
      photo = sign({
        allowed_formats: ALLOWED_FORMATS_PARAM,
        // Embedded EXIF and the predominant colors, read back on the server by createMemory.
        colors: "true",
        media_metadata: "true",
        overwrite: "false",
        public_id: photoId,
        timestamp: String(timestamp),
        type: "authenticated",
      })
    }

    let audioId: string | undefined
    let audio: Record<string, string> | null = null
    if (wantsAudio) {
      audioId = `${MEMORY_FOLDER}/audio-${deps.newId()}`
      // Posted to `video/upload`: Cloudinary stores audio as a `video` resource. The resource type is not signed.
      audio = sign({
        allowed_formats: AUDIO_FORMATS_PARAM,
        overwrite: "false",
        public_id: audioId,
        timestamp: String(timestamp),
        type: "authenticated",
      })
    }

    const ticket = signUploadTicket(
      {
        h: visitor.handle,
        ...(photoId ? { pid: photoId } : {}),
        ...(audioId ? { aid: audioId } : {}),
        exp: timestamp + TICKET_TTL_SECONDS,
      },
      deps.ticketSecret,
    )
    return { ok: true, upload: { cloudName, photo, audio, ticket } }
  } catch (error) {
    // The name only: messages from the database layer can carry query parameters.
    deps.log(`Preparing an upload failed (${error instanceof Error ? error.name : "unknown"}).`)
    return { ok: false, reason: "unavailable" }
  }
}
