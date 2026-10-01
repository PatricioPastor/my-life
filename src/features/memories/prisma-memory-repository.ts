import "server-only"
import type { Memory as MemoryRow, PrismaClient } from "@/generated/prisma/client"
import { getPrisma } from "@/shared/db/client"
import { withVisitor } from "@/shared/db/with-visitor"
import type { Memory, NewMemory } from "./memory"
import { DuplicatePublicIdError, type MemoryRepository } from "./memory-repository"
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
    audio:
      row.audioPublicId !== null && row.audioFormat !== null && row.audioBytes !== null && row.audioDurationMs !== null
        ? { publicId: row.audioPublicId, format: row.audioFormat, bytes: row.audioBytes, durationMs: row.audioDurationMs }
        : null,
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

  async countRecentBy(handle: string, since: Date): Promise<number> {
    // Row-level security lets a visitor see their own rows of every status, which is what the limit counts.
    return withVisitor(this.getDb(), handle, (tx) => tx.memory.count({ where: { handle, createdAt: { gte: since } } }))
  }
}
