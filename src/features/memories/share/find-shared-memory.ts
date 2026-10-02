import { sharedAudioPath } from "../audio-path"
import { toMemoryView, type DeliveryConfig } from "../list-memories"
import type { ApprovedMemoryReader } from "../memory-repository"
import { verifyShareToken } from "./share-token"
import type { SharedMemoryResult } from "./share-view"

export interface FindSharedMemoryDeps {
  /** SESSION_SECRET, or null when it is not configured. */
  secret: string | null
  /** Lazy, so building it (which runs the runtime-role guard) happens inside the failure handling. */
  repository: () => ApprovedMemoryReader
  /** Null when a variable is missing. The secret only signs delivery URLs; it never reaches the DTO. */
  cloudinary: DeliveryConfig | null
  /** One short line, never with personal data. */
  log: (message: string) => void
}

/**
 * The memory a share link opens, as the same DTO the glass shows: sizes, coarse place, orb color, no handle. Read as a
 * guest, so only an approved memory exists; anything else (a bad token, a missing, pending or rejected memory) is a
 * failure the page turns into a redirect to the start. The audio plays from the guest route of this token.
 */
export async function findSharedMemoryWith(deps: FindSharedMemoryDeps, token: string): Promise<SharedMemoryResult> {
  try {
    if (!deps.secret || !deps.cloudinary?.cloudName || !deps.cloudinary.apiSecret) {
      deps.log("Sharing is not configured.")
      return { ok: false, reason: "unavailable" }
    }
    const id = verifyShareToken(token, deps.secret)
    if (!id) return { ok: false, reason: "invalid" }
    const memory = await deps.repository().findApproved(id)
    if (!memory || memory.status !== "approved") return { ok: false, reason: "not_found" }
    const view = toMemoryView(memory, deps.cloudinary, sharedAudioPath(token))
    return view ? { ok: true, memory: view } : { ok: false, reason: "not_found" }
  } catch (error) {
    deps.log(`Reading a shared memory failed (${error instanceof Error ? error.name : "unknown"}).`)
    return { ok: false, reason: "unavailable" }
  }
}
