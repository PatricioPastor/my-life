import "server-only"
import { type AssetInfo, type CloudinaryAssets, verifyAsset } from "./cloudinary-assets"
import { toMemoryView, type DeliveryConfig } from "./list-memories"
import { DuplicatePublicIdError, type MemoryRepository } from "./memory-repository"
import { chooseOrbColor } from "./orb-color"
import { extractPhotoDetails } from "./photo-details"
import { decidePlace } from "./place/decide-place"
import type { FollowResult } from "./place/follow-short-link"
import type { ReverseGeocoder } from "./place/reverse-geocoder"
import { validateNewMemory } from "./validate-new-memory"
import { RATE_LIMIT } from "./upload-limits"
import { verifyUploadTicket } from "./upload-ticket"
import type { CreateMemoryInput, CreateMemoryResult } from "./upload-view"

export interface CreateMemoryDeps {
  currentVisitor: () => Promise<{ handle: string } | null>
  /** Lazy, so building it (which runs the runtime-role guard) happens inside the failure handling. */
  repository: () => MemoryRepository
  assets: () => CloudinaryAssets
  /** Null when a Cloudinary variable is missing. */
  cloudinary: DeliveryConfig | null
  ticketSecret: string | null
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

/** UTC midnight of a `YYYY-MM-DD` date, or an invalid Date when it is not a real calendar day. */
function parseDay(value: unknown): Date {
  if (typeof value !== "string" || !DATE.test(value)) return new Date(Number.NaN)
  const date = new Date(`${value}T00:00:00.000Z`)
  return date.toISOString().slice(0, 10) === value ? date : new Date(Number.NaN)
}

/**
 * Finishes an upload: checks the ticket, then trusts nothing the browser says about the photo. The asset is
 * read back from Cloudinary (image, ours, allowed format, within the size limit) and its width and height
 * come from there. Any failure before the insert destroys the asset, so rejected uploads leave nothing
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
    const publicId = ticket.pid

    const assets = deps.assets()
    // Best effort: the failure being reported matters more than a cleanup that also failed.
    const destroy = () => assets.destroy(publicId).catch(() => undefined)

    let info
    try {
      info = await assets.describe(publicId)
    } catch (error) {
      deps.log(`Reading the uploaded photo failed (${error instanceof Error ? error.name : "unknown"}).`)
      await destroy()
      return { ok: false, reason: "unavailable" }
    }
    const asset = verifyAsset(info, publicId)
    if (!asset.ok) {
      if (asset.problem !== "asset_missing") await destroy()
      return { ok: false, reason: asset.problem }
    }

    // A visitor ahead of UTC can already be on tomorrow's date: let any date that is "today" somewhere through.
    const validation = validateNewMemory(
      {
        publicId,
        caption: typeof input.caption === "string" ? input.caption : "",
        happenedOn: parseDay(input.happenedOn),
        width: asset.width,
        height: asset.height,
      },
      new Date(nowMs + 14 * HOUR_MS),
    )
    if (!validation.ok) {
      await destroy()
      return { ok: false, reason: "invalid", errors: validation.errors }
    }

    const photo = info as AssetInfo // verified above, so it exists
    // Only an explicit `true` opts in. The details decode the exact location only with that consent.
    const shareLocation = input.shareLocation === true
    const details = extractPhotoDetails(
      { format: photo.format, bytes: photo.bytes, imageMetadata: photo.imageMetadata, colors: photo.colors },
      { shareLocation },
    )

    const repository = deps.repository()
    const recent = await repository.countRecentBy(visitor.handle, new Date(nowMs - RATE_LIMIT.windowMs))
    if (recent >= RATE_LIMIT.max) {
      await destroy()
      return { ok: false, reason: "rate_limited" }
    }

    // The server alone decides the place; naming it can fail without blocking the memory.
    const place = await decidePlace(
      {
        shareLocation,
        mapsUrl: input.mapsUrl,
        photo:
          details.latitude !== null && details.longitude !== null
            ? { latitude: details.latitude, longitude: details.longitude }
            : null,
      },
      deps,
    )

    // The visitor's pick when it is a valid glowing color; else the photo's own dominant color, lifted to glow.
    const orbColor = chooseOrbColor(input.orbColor, details.dominantColor)

    try {
      const memory = await repository.createPending(visitor.handle, { ...validation.value, ...details, ...place, orbColor })
      const view = toMemoryView(memory, deps.cloudinary)
      if (!view) throw new Error("The new memory has no view.")
      return { ok: true, memory: view, locationSaved: place.locationSource !== null }
    } catch (error) {
      // The photo belongs to the memory that already exists, so it stays. Any other insert failure may have
      // committed, so the photo stays too: an orphan costs nothing, a broken memory would.
      if (error instanceof DuplicatePublicIdError) return { ok: false, reason: "duplicate" }
      throw error
    }
  } catch (error) {
    // The name only: messages from the database layer can carry query parameters.
    deps.log(`Creating a memory failed (${error instanceof Error ? error.name : "unknown"}).`)
    return { ok: false, reason: "unavailable" }
  }
}
