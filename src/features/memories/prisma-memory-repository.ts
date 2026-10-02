import "server-only"
import type { Memory as MemoryRow, PrismaClient } from "@/generated/prisma/client"
import { getPrisma } from "@/shared/db/client"
import { withVisitor } from "@/shared/db/with-visitor"
import type { Memory, NewMemory } from "./memory"
import {
  DuplicatePublicIdError,
  type ApprovedMemoryReader,
  type MemoryRepository,
  type ViewRecorder,
} from "./memory-repository"
import { storedPaletteOf, whitelistMetadata } from "./photo-details"

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
    kind: row.kind,
    format: row.format,
    bytes: row.bytes,
    takenAt: row.takenAt,
    dominantColor: row.dominantColor,
    // JSON columns are re-sanitized on the way out, so a hand-edited row cannot leak a field.
    palette: storedPaletteOf(row.palette),
    metadata: whitelistMetadata(row.metadata),
    // Decimal columns arrive as Prisma.Decimal; the domain holds plain numbers.
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    placeName: row.placeName,
    locationSource: row.locationSource,
    orbColor: row.orbColor,
    viewCount: row.viewCount,
    audio:
      row.audioPublicId !== null && row.audioFormat !== null && row.audioBytes !== null && row.audioDurationMs !== null
        ? { publicId: row.audioPublicId, format: row.audioFormat, bytes: row.audioBytes, durationMs: row.audioDurationMs }
        : null,
  }
}

/**
 * A row-level security refusal as it reaches us: PostgreSQL's SQLSTATE 42501 (`insufficient_privilege`, "new row violates
 * row-level security policy"), either as the error's own code, in Prisma's `meta` for a raw query, or in its message.
 */
function isRlsRefusal(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const { code, meta, message } = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown }
  return (
    code === "42501" ||
    meta?.code === "42501" ||
    (typeof message === "string" && /row-level security|42501/i.test(message))
  )
}

/**
 * Adapter over Prisma. The client is resolved lazily (`getDb`), so constructing the repository
 * never connects. Row-level security does the authorization: every read and write runs through
 * `withVisitor`, so the policies see the visitor's handle.
 */
export class PrismaMemoryRepository implements MemoryRepository, ApprovedMemoryReader, ViewRecorder {
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

  async findForVisitor(handle: string, id: string): Promise<Memory | null> {
    // Same rule as the listing, restated next to the policy: a loosened policy cannot widen what one id reveals.
    const row = await withVisitor(this.getDb(), handle, (tx) =>
      tx.memory.findFirst({ where: { id, OR: [{ status: "approved" }, { handle, status: "pending" }] } }),
    )
    return row ? toDomain(row) : null
  }

  async findApproved(id: string): Promise<Memory | null> {
    // A guest has no handle: an empty one makes `app.handle` NULL, so the select policy lets only approved rows through.
    // The explicit `status` restates it, so a loosened policy cannot widen what a link reveals.
    const row = await withVisitor(this.getDb(), "", (tx) => tx.memory.findFirst({ where: { id, status: "approved" } }))
    return row ? toDomain(row) : null
  }

  async createPending(handle: string, input: NewMemory): Promise<Memory> {
    // Only the columns app_user may insert (column-level grants); id, status and created_at come from DB defaults.
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
            kind: input.kind,
            format: input.format,
            bytes: input.bytes,
            takenAt: input.takenAt,
            dominantColor: input.dominantColor,
            palette: input.palette,
            metadata: input.metadata,
            latitude: input.latitude,
            longitude: input.longitude,
            placeName: input.placeName,
            locationSource: input.locationSource,
            orbColor: input.orbColor,
            audioPublicId: input.audio?.publicId ?? null,
            audioFormat: input.audio?.format ?? null,
            audioBytes: input.audio?.bytes ?? null,
            audioDurationMs: input.audio?.durationMs ?? null,
          },
        }),
      )
      return toDomain(row)
    } catch (error) {
      // P2002 is the unique-constraint violation code; public_id and audio_public_id are the unique columns a visitor sets.
      if ((error as { code?: unknown } | null)?.code === "P2002") throw new DuplicatePublicIdError()
      throw error
    }
  }

  async recordView(handle: string, memoryId: string): Promise<{ counted: boolean }> {
    try {
      // One statement: a new (memory, visitor) pair is inserted (open_count defaults to 1, and the AFTER INSERT trigger
      // adds the visitor to the memory's count); a known pair takes the UPDATE path instead, which fires no INSERT trigger.
      // The only columns written are the ones app_user may. `open_count` comes back to tell the two apart: 1 is a new pair.
      const rows = await withVisitor(
        this.getDb(),
        handle,
        (tx) => tx.$queryRaw<{ open_count: number }[]>`
          INSERT INTO memory_views (memory_id, handle)
          VALUES (${memoryId}::uuid, ${handle})
          ON CONFLICT (memory_id, handle) DO UPDATE
          SET last_viewed_at = now(), open_count = memory_views.open_count + 1
          RETURNING open_count`,
      )
      return { counted: Number(rows[0]?.open_count) === 1 }
    } catch (error) {
      // The author's own memory and one that is not approved fail the insert policy: nothing to record, nothing to say.
      if (isRlsRefusal(error)) return { counted: false }
      throw error
    }
  }

  async countRecentBy(handle: string, since: Date): Promise<number> {
    // Row-level security lets a visitor see their own rows of every status, which is what the limit counts.
    return withVisitor(this.getDb(), handle, (tx) => tx.memory.count({ where: { handle, createdAt: { gte: since } } }))
  }
}
