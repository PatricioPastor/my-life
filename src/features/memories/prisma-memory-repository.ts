import "server-only"
import type { Memory as MemoryRow, PrismaClient } from "@/generated/prisma/client"
import { getPrisma } from "@/shared/db/client"
import { withVisitor } from "@/shared/db/with-visitor"
import type { Memory, NewMemory } from "./memory"
import type { MemoryRepository } from "./memory-repository"

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
 * never connects. Row-level security does the authorization: reads run without a visitor and
 * therefore only see approved rows; writes run through `withVisitor`.
 */
export class PrismaMemoryRepository implements MemoryRepository {
  constructor(private readonly getDb: () => Db = getPrisma) {}

  async listApproved(): Promise<Memory[]> {
    const rows = await this.getDb().memory.findMany({
      where: { status: "approved" },
      orderBy: [{ happenedOn: "asc" }, { createdAt: "asc" }],
    })
    return rows.map(toDomain)
  }

  async createPending(handle: string, input: NewMemory): Promise<Memory> {
    // Only the columns app_user may insert; id, status and created_at come from DB defaults.
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
  }
}
