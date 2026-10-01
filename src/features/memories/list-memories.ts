import { FULL_TRANSFORM, THUMB_TRANSFORM, cloudinaryUrl } from "./cloudinary-url"
import type { Memory } from "./memory"
import type { MemoryRepository } from "./memory-repository"
import type { ListMemoriesResult, MemoryPlace, MemoryView } from "./memory-view"
import { chooseOrbColor } from "./orb-color"
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

/** The coarse place the client gets: 2 decimals and the name. The exact position stays on the server. */
function toPlace(memory: Memory): MemoryPlace | null {
  if (memory.latitude === null || memory.longitude === null) return null
  return { lat: roundCoordinate(memory.latitude), lng: roundCoordinate(memory.longitude), name: memory.placeName }
}

export function toMemoryView(memory: Memory, { cloudName, apiSecret }: DeliveryConfig): MemoryView | null {
  if (memory.status === "rejected") return null
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
    // Re-checked on the way out: an older row has none, and a hand-edited one must not send a color that sinks.
    orbColor: chooseOrbColor(memory.orbColor, memory.dominantColor),
    thumbUrl: cloudinaryUrl(cloudName, memory.publicId, THUMB_TRANSFORM, apiSecret),
    fullUrl: cloudinaryUrl(cloudName, memory.publicId, FULL_TRANSFORM, apiSecret),
    // Audio arrives with the audio data (the other half of this feature); until then every memory is a photo.
    audio: null,
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
    const memories = rows.flatMap((row) => toMemoryView(row, cloudinary) ?? [])
    return { ok: true, memories }
  } catch (error) {
    // The name only: messages from the database layer can carry query parameters.
    deps.log(`Listing memories failed (${error instanceof Error ? error.name : "unknown"}).`)
    return { ok: false, reason: "unavailable" }
  }
}
