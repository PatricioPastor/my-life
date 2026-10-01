import "server-only"
import type { Memory as MemoryRow, PrismaClient } from "@/generated/prisma/client"
import { getPrisma } from "@/shared/db/client"
import { withVisitor } from "@/shared/db/with-visitor"
import type { Memory, NewMemory } from "./memory"
import { DuplicatePublicIdError, type MemoryRepository } from "./memory-repository"

/** The most memories one listing returns. */
export const MEMORY_LIST_LIMIT = 300

type Db = Pick<PrismaClient, "$transaction" | "memory">

function toDomain(row: MemoryRow): Memory {
  return {
    id: row.id,
    handle: row.handle,
    publicId: row.publicId,
    caption: row.caption,
    happenedOn: row.happenedOn,
    width: row.width,
    height: row.height,
    status: row.status,
    createdAt: row.createdAt,
  }
}

/**
 * Adapter over Prisma. The client is resolved lazily (`getDb`), so constructing the repository
 * never connects. Row-level security does the authorization: every read and write runs through
 * `withVisitor`, so the policies see the visitor's handle.
 */
export class PrismaMemoryRepository implements MemoryRepository {
  constructor(private readonly getDb: () => Db = getPrisma) {}

  async listForVisitor(handle: string): Promise<Memory[]> {
    // The policy already limits rows to approved ones plus this visitor's own; the explicit `where`
    // repeats that (and leaves out their rejected ones) so a loosened policy cannot widen the result.
    const rows = await withVisitor(this.getDb(), handle, (tx) =>
      tx.memory.findMany({
        where: { OR: [{ status: "approved" }, { handle, status: "pending" }] },
        orderBy: [{ happenedOn: "asc" }, { createdAt: "asc" }],
        take: MEMORY_LIST_LIMIT,
      }),
    )
    return rows.map(toDomain)
  }

  async createPending(handle: string, input: NewMemory): Promise<Memory> {
    // Only the columns app_user may insert; id, status and created_at come from DB defaults.
    try {
      const row = await withVisitor(this.getDb(), handle, (tx) =>
        tx.memory.create({
          data: {
            handle,
            publicId: input.publicId,
            caption: input.caption,
            happenedOn: input.happenedOn,
            width: input.width,
            height: input.height,
          },
        }),
      )
      return toDomain(row)
    } catch (error) {
      // P2002 is the unique-constraint violation code; public_id is the only unique column a visitor sets.
      if ((error as { code?: unknown } | null)?.code === "P2002") throw new DuplicatePublicIdError()
      throw error
    }
  }

  async countRecentBy(handle: string, since: Date): Promise<number> {
    // Row-level security lets a visitor see their own rows of every status, which is what the limit counts.
    return withVisitor(this.getDb(), handle, (tx) => tx.memory.count({ where: { handle, createdAt: { gte: since } } }))
  }
}
