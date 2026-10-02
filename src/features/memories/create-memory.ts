import "server-only"
import {
  type AssetInfo,
  type AudioInfo,
  type CloudinaryAssets,
  verifyAsset,
  verifyAudio,
} from "./cloudinary-assets"
import { toMemoryView, type DeliveryConfig } from "./list-memories"
import { DuplicatePublicIdError, type MemoryRepository } from "./memory-repository"
import type { Memory, StoredAudio } from "./memory"
import { chooseOrbColor } from "./orb-color"
import { extractPhotoDetails, NO_PHOTO_DETAILS } from "./photo-details"
import { decidePlace, type PlaceColumns } from "./place/decide-place"
import type { FollowResult } from "./place/follow-short-link"
import type { ReverseGeocoder } from "./place/reverse-geocoder"
import { validateNewMemory } from "./validate-new-memory"
import { RATE_LIMIT } from "./upload-limits"
import { verifyUploadTicket } from "./upload-ticket"
import type { CreateMemoryFailure, CreateMemoryInput, CreateMemoryResult } from "./upload-view"

export interface CreateMemoryDeps {
  currentVisitor: () => Promise<{ handle: string } | null>
  /** Lazy, so building it (which runs the runtime-role guard) happens inside the failure handling. */
  repository: () => MemoryRepository
  assets: () => CloudinaryAssets
  /** Null when a Cloudinary variable is missing. */
  cloudinary: DeliveryConfig | null
  ticketSecret: string | null
  /** The most an audio may weigh on this server (the plan maximum unless an env variable says otherwise). */
  maxAudioBytes?: number
  /** Lazy: only built when a visitor opted in and the photo has a location to name. */
  geocoder: () => ReverseGeocoder
  /** Follows a Google short link on the server (SSRF-guarded). Only called for a pasted short link. */
  follow: (url: string) => Promise<FollowResult>
  /** Milliseconds, like `Date.now`. */
  now: () => number
  /** One short line, never with personal data. */
  log: (message: string) => void
}

const HOUR_MS = 60 * 60 * 1000
const DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The memory a new one is contributed from, or null. The browser only names it by id: it must look like one, exist,
 * be visible to this visitor and be approved (the database insists on that last part too). Anything else drops the
 * relation without a word: a stale or forged id never costs the visitor their upload.
 */
async function relatedMemory(
  repository: MemoryRepository,
  handle: string,
  id: unknown,
  log: (message: string) => void,
): Promise<Memory | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null
  try {
    const found = await repository.findForVisitor(handle, id.toLowerCase())
    return found && found.status === "approved" ? found : null
  } catch (error) {
    log(`Reading the related memory failed (${error instanceof Error ? error.name : "unknown"}).`)
    return null
  }
}

/** The insert was refused over the related memory: a row-level security refusal or a foreign key violation. */
function isRelationRefusal(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const { code, meta, message } = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown }
  return (
    code === "42501" ||
    code === "23503" ||
    code === "P2003" ||
    meta?.code === "42501" ||
    meta?.code === "23503" ||
    (typeof message === "string" && /row-level security|foreign key/i.test(message))
  )
}

/** The place of a memory to copy, as the columns a new one stores. */
const placeOf = (memory: Memory): PlaceColumns => ({
  latitude: memory.latitude,
  longitude: memory.longitude,
  locationSource: memory.locationSource,
  placeName: memory.placeName,
  placeAddress: memory.placeAddress,
})

/** UTC midnight of a `YYYY-MM-DD` date, or an invalid Date when it is not a real calendar day. */
function parseDay(value: unknown): Date {
  if (typeof value !== "string" || !DATE.test(value)) return new Date(Number.NaN)
  const date = new Date(`${value}T00:00:00.000Z`)
  return date.toISOString().slice(0, 10) === value ? date : new Date(Number.NaN)
}

/**
 * Finishes an upload: checks the ticket, then trusts nothing the browser says about the assets. Each one the ticket
 * covers is read back from Cloudinary: the photo (an image of ours, an allowed format, within the size limit, with its
 * width and height) and the audio (audio of ours, an allowed format, within the size cap and 60 minutes, with its duration,
 * size and format). Any failure before the insert destroys every uploaded asset, so rejected uploads leave nothing
 * behind. The row is inserted as the visitor, under row-level security, and starts `pending`.
 */
export async function createMemoryWith(deps: CreateMemoryDeps, input: CreateMemoryInput): Promise<CreateMemoryResult> {
  try {
    const visitor = await deps.currentVisitor()
    if (!visitor) return { ok: false, reason: "no_session" }
    if (!deps.cloudinary || !deps.ticketSecret) {
      deps.log("Cloudinary or the session secret is not configured.")
      return { ok: false, reason: "unavailable" }
    }

    const nowMs = deps.now()
    const ticket =
      typeof input?.ticket === "string" ? verifyUploadTicket(input.ticket, deps.ticketSecret, nowMs / 1000) : null
    if (!ticket || ticket.h !== visitor.handle) return { ok: false, reason: "invalid_ticket" }
    const photoId = ticket.pid ?? null
    const audioId = ticket.aid ?? null

    const assets = deps.assets()
    // Best effort: the failure being reported matters more than a cleanup that also failed. `except` skips an
    // asset Cloudinary reported as missing: there is nothing to delete.
    const destroyAll = async (except?: "photo" | "audio") => {
      await Promise.all([
        photoId && except !== "photo" ? assets.destroy(photoId).catch(() => undefined) : undefined,
        audioId && except !== "audio" ? assets.destroyAudio(audioId).catch(() => undefined) : undefined,
      ])
    }
    const refuse = async (reason: CreateMemoryFailure, except?: "photo" | "audio"): Promise<CreateMemoryResult> => {
      await destroyAll(except)
      return { ok: false, reason }
    }

    let photoInfo: AssetInfo | null = null
    let photo: { width: number; height: number } | null = null
    if (photoId) {
      try {
        photoInfo = await assets.describe(photoId)
      } catch (error) {
        deps.log(`Reading the uploaded photo failed (${error instanceof Error ? error.name : "unknown"}).`)
        return refuse("unavailable")
      }
      const verified = verifyAsset(photoInfo, photoId)
      if (!verified.ok) return refuse(verified.problem, verified.problem === "asset_missing" ? "photo" : undefined)
      photo = { width: verified.width, height: verified.height }
    }

    let audio: StoredAudio | null = null
    if (audioId) {
      let audioInfo: AudioInfo | null
      try {
        audioInfo = await assets.describeAudio(audioId)
      } catch (error) {
        deps.log(`Reading the uploaded audio failed (${error instanceof Error ? error.name : "unknown"}).`)
        return refuse("unavailable")
      }
      const verified = verifyAudio(audioInfo, audioId, deps.maxAudioBytes)
      if (!verified.ok) return refuse(verified.problem, verified.problem === "audio_missing" ? "audio" : undefined)
      audio = { publicId: audioId, format: verified.format, bytes: verified.bytes, durationMs: verified.durationMs }
    }

    // A visitor ahead of UTC can already be on tomorrow's date: let any date that is "today" somewhere through.
    const validation = validateNewMemory(
      {
        publicId: photoId,
        caption: typeof input.caption === "string" ? input.caption : "",
        happenedOn: parseDay(input.happenedOn),
        width: photo?.width ?? null,
        height: photo?.height ?? null,
        audio,
      },
      new Date(nowMs + 14 * HOUR_MS),
    )
    if (!validation.ok) {
      await destroyAll()
      return { ok: false, reason: "invalid", errors: validation.errors }
    }

    // Only an explicit `true` opts in. The details decode the exact location only with that consent. Without a
    // photo there is nothing to read (no EXIF, no colors): only a pasted Maps link can then give a place.
    const shareLocation = input.shareLocation === true
    const details = photoInfo
      ? extractPhotoDetails(
          { format: photoInfo.format, bytes: photoInfo.bytes, imageMetadata: photoInfo.imageMetadata, colors: photoInfo.colors },
          { shareLocation },
        )
      : NO_PHOTO_DETAILS

    const repository = deps.repository()
    const recent = await repository.countRecentBy(visitor.handle, new Date(nowMs - RATE_LIMIT.windowMs))
    if (recent >= RATE_LIMIT.max) return refuse("rate_limited")

    // Contributed from another memory: only an approved one this visitor can see counts, else it is quietly dropped.
    const related = await relatedMemory(repository, visitor.handle, input.relatedMemoryId, deps.log)

    // The server alone decides the place; naming it can fail without blocking the memory. "Mismo lugar" copies the
    // related memory's place, read here on the server: the browser never sends (or sees) its exact position.
    const place = await decidePlace(
      {
        shareLocation,
        mapsUrl: input.mapsUrl,
        photo:
          details.latitude !== null && details.longitude !== null
            ? { latitude: details.latitude, longitude: details.longitude }
            : null,
        related: related && input.samePlace === true ? placeOf(related) : null,
      },
      deps,
    )

    // The visitor's pick when it is a valid glowing color; else the photo's own dominant color, lifted to glow; else
    // (an audio-only memory with no pick) the default cool tone.
    const orbColor = chooseOrbColor(input.orbColor, details.dominantColor)

    try {
      const row = { ...validation.value, ...details, ...place, orbColor }
      let memory: Memory
      let kept = related
      try {
        memory = await repository.createPending(visitor.handle, { ...row, relatedMemoryId: related?.id ?? null })
      } catch (error) {
        // The parent can be rejected or removed between the read above and the insert; the database then refuses the
        // relation. The relation is the only thing at stake: save the memory without it, once.
        if (!related || !isRelationRefusal(error)) throw error
        deps.log("The related memory is gone: saving the memory without the relation.")
        kept = null
        memory = await repository.createPending(visitor.handle, { ...row, relatedMemoryId: null })
      }
      // The related memory is approved, so the visitor sees it: the new memory's DTO may carry its id.
      const view = toMemoryView(memory, deps.cloudinary, undefined, kept ? new Set([kept.id]) : undefined)
      if (!view) throw new Error("The new memory has no view.")
      return { ok: true, memory: view, locationSaved: place.locationSource !== null }
    } catch (error) {
      // The assets belong to the memory that already exists, so they stay. Any other insert failure may have
      // committed, so they stay too: an orphan costs nothing, a broken memory would.
      if (error instanceof DuplicatePublicIdError) return { ok: false, reason: "duplicate" }
      throw error
    }
  } catch (error) {
    // The name only: messages from the database layer can carry query parameters.
    deps.log(`Creating a memory failed (${error instanceof Error ? error.name : "unknown"}).`)
    return { ok: false, reason: "unavailable" }
  }
}
