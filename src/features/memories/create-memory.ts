import "server-only"
import { type CloudinaryAssets, verifyAsset } from "./cloudinary-assets"
import { toMemoryView } from "./list-memories"
import { DuplicatePublicIdError, type MemoryRepository } from "./memory-repository"
import { validateNewMemory } from "./validate-new-memory"
import { RATE_LIMIT } from "./upload-limits"
import { verifyUploadTicket } from "./upload-ticket"
import type { CreateMemoryInput, CreateMemoryResult } from "./upload-view"

export interface CreateMemoryDeps {
  currentVisitor: () => Promise<{ handle: string } | null>
  /** Lazy, so building it (which runs the runtime-role guard) happens inside the failure handling. */
  repository: () => MemoryRepository
  assets: () => CloudinaryAssets
  cloudName: string | undefined
  ticketSecret: string | null
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
    if (!deps.cloudName || !deps.ticketSecret) {
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

    const repository = deps.repository()
    const recent = await repository.countRecentBy(visitor.handle, new Date(nowMs - RATE_LIMIT.windowMs))
    if (recent >= RATE_LIMIT.max) {
      await destroy()
      return { ok: false, reason: "rate_limited" }
    }

    try {
      const memory = await repository.createPending(visitor.handle, validation.value)
      const view = toMemoryView(memory, deps.cloudName)
      if (!view) throw new Error("The new memory has no view.")
      return { ok: true, memory: view }
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
