import type { MemoryRepository } from "../memory-repository"
import { signShareToken } from "./share-token"
import type { ShareMemoryResult } from "./share-view"

export interface ShareMemoryDeps {
  currentVisitor: () => Promise<{ handle: string } | null>
  /** Lazy, so building it (which runs the runtime-role guard) happens inside the failure handling. */
  repository: () => MemoryRepository
  /** SESSION_SECRET, or null when it is not configured. */
  secret: string | null
  /** The canonical site origin, without a trailing slash. */
  siteUrl: string
  /** One short line, never with personal data. */
  log: (message: string) => void
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The link to share one memory. Needs a session; the memory must be visible to the visitor AND approved (a pending or
 * rejected one is never shareable, even the visitor's own). The token is signed here, so the client never builds one.
 */
export async function shareMemoryWith(deps: ShareMemoryDeps, input: { id: string }): Promise<ShareMemoryResult> {
  try {
    const visitor = await deps.currentVisitor()
    if (!visitor) return { ok: false, reason: "no_session" }
    if (typeof input?.id !== "string" || !UUID.test(input.id)) return { ok: false, reason: "not_shareable" }
    if (!deps.secret) {
      deps.log("The session secret is not configured.")
      return { ok: false, reason: "unavailable" }
    }
    const memory = await deps.repository().findForVisitor(visitor.handle, input.id)
    if (!memory || memory.status !== "approved") return { ok: false, reason: "not_shareable" }
    return { ok: true, url: `${deps.siteUrl}/m/${signShareToken(memory.id, deps.secret)}` }
  } catch (error) {
    // The name only: messages from the database layer can carry query parameters.
    deps.log(`Sharing a memory failed (${error instanceof Error ? error.name : "unknown"}).`)
    return { ok: false, reason: "unavailable" }
  }
}
