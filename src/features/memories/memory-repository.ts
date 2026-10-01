import type { Memory, NewMemory } from "./memory"

/** Port: persistence of memories. Adapters live beside it (see prisma-memory-repository). */
export interface MemoryRepository {
  /**
   * What this visitor may see: every approved memory plus their own pending ones, oldest `happenedOn`
   * first, capped. Runs under the visitor's handle so row-level security decides.
   */
  listForVisitor(handle: string): Promise<Memory[]>
  /**
   * Stores a new memory as `pending` under the visitor's handle. Input must be validated.
   * Throws {@link DuplicatePublicIdError} when the public id is already taken.
   */
  createPending(handle: string, input: NewMemory): Promise<Memory>
  /** How many memories this visitor created since `since`, of any status: the input of the upload rate limit. */
  countRecentBy(handle: string, since: Date): Promise<number>
}

/** A memory with this Cloudinary public id already exists. */
export class DuplicatePublicIdError extends Error {
  constructor() {
    super("A memory with this public id already exists.")
    this.name = "DuplicatePublicIdError"
  }
}
