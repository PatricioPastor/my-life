import type { Memory, NewMemory } from "./memory"

/** Port: persistence of memories. Adapters live beside it (see prisma-memory-repository). */
export interface MemoryRepository {
  /** Approved memories, oldest `happenedOn` first. */
  listApproved(): Promise<Memory[]>
  /** Stores a new memory as `pending` under the visitor's handle. Input must be validated. */
  createPending(handle: string, input: NewMemory): Promise<Memory>
}
