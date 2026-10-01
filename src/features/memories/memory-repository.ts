import type { Memory, NewMemory } from "./memory"

/** Port: persistence of memories. Adapters live beside it (see prisma-memory-repository). */
export interface MemoryRepository {
  /**
   * What this visitor may see: every approved memory plus their own pending ones, oldest `happenedOn`
   * first, capped. Runs under the visitor's handle so row-level security decides.
   */
  listForVisitor(handle: string): Promise<Memory[]>
  /** Stores a new memory as `pending` under the visitor's handle. Input must be validated. */
  createPending(handle: string, input: NewMemory): Promise<Memory>
}
