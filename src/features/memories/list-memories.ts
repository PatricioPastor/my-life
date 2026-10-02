import { memoryAudioPath } from "./audio-path"
import { FULL_TRANSFORM, THUMB_TRANSFORM, cloudinaryUrl, squareTransform } from "./cloudinary-url"
import type { Memory } from "./memory"
import type { MemoryRepository } from "./memory-repository"
import type { ListMemoriesResult, MemoryPhoto, MemoryPlace, MemoryView } from "./memory-view"
import { chooseOrbColor } from "./orb-color"
import { deliverySides } from "./photo-ladder"
import { roundCoordinate } from "./place/coordinates"

export interface ListMemoriesDeps {
  currentVisitor: () => Promise<{ handle: string } | null>
  /** Lazy, so building it (which runs the runtime-role guard) happens inside the failure handling. */
  repository: () => MemoryRepository
  /** Null when a variable is missing. The secret only signs delivery URLs; it never reaches the DTO. */
  cloudinary: DeliveryConfig | null
  /** One short line, never with personal data. */
  log: (message: string) => void
}

/** The DTO of a memory the visitor may see; rejected ones have none. */
export interface DeliveryConfig {
  cloudName: string
  apiSecret: string
}

/** The coarse place the client gets: 2 decimals, the name and the address. The exact position stays on the server. */
function toPlace(memory: Memory): MemoryPlace | null {
  if (memory.latitude === null || memory.longitude === null) return null
  return {
    lat: roundCoordinate(memory.latitude),
    lng: roundCoordinate(memory.longitude),
    name: memory.placeName,
    address: memory.placeAddress,
  }
}

const NONE: ReadonlySet<string> = new Set()

/** The photo's signed square crops, one per side the photo can fill (see `deliverySides`). */
function toPhoto(memory: Memory, { cloudName, apiSecret }: DeliveryConfig): MemoryPhoto | null {
  if (memory.publicId === null || memory.width === null || memory.height === null) return null
  const publicId = memory.publicId
  const sizes = deliverySides(memory.width, memory.height).map((width) => ({
    width,
    url: cloudinaryUrl(cloudName, publicId, squareTransform(width), apiSecret),
  }))
  return sizes.length > 0 ? { sizes } : null
}

export function toMemoryView(
  memory: Memory,
  { cloudName, apiSecret }: DeliveryConfig,
  /** Where the audio plays from; the session route unless a guest route is given (see `sharedAudioPath`). */
  audioUrl: string = memoryAudioPath(memory.id),
  /** The ids the reader may see: the relation is only sent when it points at one of them. */
  visibleIds: ReadonlySet<string> = NONE,
): MemoryView | null {
  if (memory.status === "rejected") return null
  // A row with neither a photo nor an audio cannot exist (a CHECK refuses it); if one did, it would show nothing.
  if (memory.publicId === null && memory.audio === null) return null
  return {
    id: memory.id,
    caption: memory.caption,
    happenedOn: memory.happenedOn.toISOString().slice(0, 10),
    status: memory.status,
    width: memory.width,
    height: memory.height,
    kind: memory.kind,
    takenAt: memory.takenAt ? memory.takenAt.toISOString() : null,
    dominantColor: memory.dominantColor,
    place: toPlace(memory),
    relatedId: memory.relatedMemoryId !== null && visibleIds.has(memory.relatedMemoryId) ? memory.relatedMemoryId : null,
    // Re-checked on the way out: an older row has none, and a hand-edited one must not send a color that sinks.
    orbColor: chooseOrbColor(memory.orbColor, memory.dominantColor),
    viewCount: memory.viewCount,
    thumbUrl: memory.publicId === null ? null : cloudinaryUrl(cloudName, memory.publicId, THUMB_TRANSFORM, apiSecret),
    fullUrl: memory.publicId === null ? null : cloudinaryUrl(cloudName, memory.publicId, FULL_TRANSFORM, apiSecret),
    photo: toPhoto(memory, { cloudName, apiSecret }),
    // Neither the original (webm, ogg, m4a...) nor the signed mp3 URL leaves the server: the browser plays from our own
    // route, which streams the audio with byte ranges (Safari and iOS cannot seek a long audio without them).
    audio: memory.audio ? { url: audioUrl, durationMs: memory.audio.durationMs } : null,
  }
}

/**
 * The memories this visitor may see, as DTOs. No admitted session is `no_session`; anything that goes
 * wrong (configuration, the runtime-role guard, the database) is `unavailable`, logged once without
 * personal data, so the space shows a calm message instead of crashing.
 */
export async function listMemoriesWith(deps: ListMemoriesDeps): Promise<ListMemoriesResult> {
  try {
    const visitor = await deps.currentVisitor()
    if (!visitor) return { ok: false, reason: "no_session" }
    const cloudinary = deps.cloudinary
    if (!cloudinary?.cloudName || !cloudinary.apiSecret) {
      deps.log("Cloudinary is not configured.")
      return { ok: false, reason: "unavailable" }
    }
    const rows = await deps.repository().listForVisitor(visitor.handle)
    // What this visitor may see is exactly what came back (row-level security): a relation to anything else is not sent.
    const visibleIds = new Set(rows.filter((row) => row.status !== "rejected").map((row) => row.id))
    const memories = rows.flatMap((row) => toMemoryView(row, cloudinary, memoryAudioPath(row.id), visibleIds) ?? [])
    return { ok: true, memories }
  } catch (error) {
    // The name only: messages from the database layer can carry query parameters.
    deps.log(`Listing memories failed (${error instanceof Error ? error.name : "unknown"}).`)
    return { ok: false, reason: "unavailable" }
  }
}
