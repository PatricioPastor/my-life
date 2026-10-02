import type { MemoryRepository, ViewRecorder } from "../memory-repository"
import type { RecordViewResult } from "./view-result"

export interface RecordViewDeps {
  currentVisitor: () => Promise<{ handle: string } | null>
  /** Lazy, so building it (which runs the runtime-role guard) happens inside the failure handling. */
  repository: () => Pick<MemoryRepository, "findForVisitor"> & ViewRecorder
  /** One short line, never with personal data. */
  log: (message: string) => void
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Records that the visitor opened a memory. Needs a session (a guest has no account to count). The memory is read as the
 * visitor first, and only an approved one somebody else wrote is recorded: the author's own and any pending or rejected
 * one are `not_countable`, as is one the visitor cannot see at all. The handle comes from the session, never from the
 * input. It never throws: the glass calls it in the background and ignores the answer's failures.
 */
export async function recordMemoryViewWith(deps: RecordViewDeps, input: { id: string }): Promise<RecordViewResult> {
  try {
    const visitor = await deps.currentVisitor()
    if (!visitor) return { ok: false, reason: "no_session" }
    if (typeof input?.id !== "string" || !UUID.test(input.id)) return { ok: false, reason: "not_countable" }
    const repository = deps.repository()
    const memory = await repository.findForVisitor(visitor.handle, input.id)
    if (!memory || memory.status !== "approved" || memory.handle === visitor.handle) {
      return { ok: false, reason: "not_countable" }
    }
    const { counted } = await repository.recordView(visitor.handle, memory.id)
    return { ok: true, counted }
  } catch (error) {
    // The name only: messages from the database layer can carry query parameters.
    deps.log(`Recording a view failed (${error instanceof Error ? error.name : "unknown"}).`)
    return { ok: false, reason: "unavailable" }
  }
}
