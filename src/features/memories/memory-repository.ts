import type { Memory, NewMemory } from "./memory"

/** Port: persistence of memories. Adapters live beside it (see prisma-memory-repository). */
export interface MemoryRepository {
  /**
   * What this visitor may see: every approved memory plus their own pending ones, oldest `happenedOn`
   * first, capped. Runs under the visitor's handle so row-level security decides.
   */
  listForVisitor(handle: string): Promise<Memory[]>
  /**
   * One memory by id, under the same rule as {@link listForVisitor}: an approved one, or the visitor's own pending one.
   * Null when it does not exist or the visitor may not see it (the two look the same on purpose).
   */
  findForVisitor(handle: string, id: string): Promise<Memory | null>
  /**
   * Stores a new memory as `pending` under the visitor's handle. Input must be validated.
   * Throws {@link DuplicatePublicIdError} when the public id is already taken.
   */
  createPending(handle: string, input: NewMemory): Promise<Memory>
  /** How many memories this visitor created since `since`, of any status: the input of the upload rate limit. */
  countRecentBy(handle: string, since: Date): Promise<number>
}

/**
 * Port: what a guest holding a share link may read. Apart from {@link MemoryRepository} on purpose: it has no visitor,
 * and the only thing it can ever return is an approved memory.
 */
export interface ApprovedMemoryReader {
  /** One APPROVED memory by id, or null (missing, pending and rejected look the same). Runs without a visitor handle. */
  findApproved(id: string): Promise<Memory | null>
}

/**
 * Port: counting who opened a memory. Apart from {@link MemoryRepository} on purpose: it only ever writes one row, under
 * the visitor's own handle, and the handles it stores are never read back by the application.
 */
export interface ViewRecorder {
  /**
   * Records that this visitor opened this memory: the first time adds them to the distinct viewers (`counted: true`), a
   * later one only bumps their `open_count` and `last_viewed_at` (`counted: false`). Runs under the visitor's handle, so
   * row-level security decides: an author's own memory or one that is not approved is refused by the database, and that
   * refusal is a quiet no-op (`counted: false`). Any other failure throws.
   */
  recordView(handle: string, memoryId: string): Promise<{ counted: boolean }>
}

/** A memory with this Cloudinary public id already exists. */
export class DuplicatePublicIdError extends Error {
  constructor() {
    super("A memory with this public id already exists.")
    this.name = "DuplicatePublicIdError"
  }
}
