import { describe, expect, it, vi } from "vitest"

// `server-only` throws outside the react-server condition; tests run in plain node.
vi.mock("server-only", () => ({}))

import { MEMORY_LIST_LIMIT, PrismaMemoryRepository } from "./prisma-memory-repository"
import { DuplicatePublicIdError } from "./memory-repository"
import type { NewMemory } from "./memory"

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  handle: "ana",
  publicId: "memories/abc",
  caption: "hello",
  happenedOn: new Date("2024-06-15T00:00:00.000Z"),
  width: 10,
  height: 20,
  status: "approved" as const,
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  kind: "image" as const,
  format: "jpg",
  bytes: 123_456,
  takenAt: new Date("2024-06-15T12:00:00.000Z"),
  dominantColor: "#112233",
  palette: [{ color: "#112233", share: 40 }],
  metadata: { Make: "Apple" },
  latitude: 40.712812,
  longitude: -74.006009,
  placeName: "Nueva York",
  locationSource: "photo" as const,
  orbColor: "#ff9a3c" as string | null,
}

/** Minimal fake of the Prisma surface the adapter touches, recording call order. */
function fakeDb(rows: unknown[] = [row]) {
  const calls: Array<{ name: string; args: unknown[] }> = []
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ name: "setConfig", args: [strings.join("?"), ...values] })
      return []
    }),
    memory: {
      create: vi.fn(async (arg: unknown) => {
        calls.push({ name: "create", args: [arg] })
        return row
      }),
      findMany: vi.fn(async (arg: unknown) => {
        calls.push({ name: "findMany", args: [arg] })
        return rows
      }),
      count: vi.fn(async (arg: unknown) => {
        calls.push({ name: "count", args: [arg] })
        return 3
      }),
    },
  }
  const db = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  }
  return { db, tx, calls }
}

const input: NewMemory = {
  publicId: "memories/abc",
  caption: "hello",
  happenedOn: new Date("2024-06-15T00:00:00.000Z"),
  width: 10,
  height: 20,
  kind: "image",
  format: "jpg",
  bytes: 123_456,
  takenAt: new Date("2024-06-15T12:00:00.000Z"),
  dominantColor: "#112233",
  palette: [{ color: "#112233", share: 40 }],
  metadata: { Make: "Apple" },
  latitude: 40.712812,
  longitude: -74.006009,
  placeName: "Nueva York",
  locationSource: "photo",
  orbColor: "#ff9a3c",
}

describe("PrismaMemoryRepository", () => {
  describe("listForVisitor", () => {
    it("runs in one transaction that sets the handle before reading", async () => {
      const { db, calls } = fakeDb()
      await new PrismaMemoryRepository(() => db as never).listForVisitor("ana")
      expect(db.$transaction).toHaveBeenCalledTimes(1)
      expect(calls.map((c) => c.name)).toEqual(["setConfig", "findMany"])
      const [sql, value] = calls[0].args as [string, string]
      expect(sql).toContain("set_config('app.handle'")
      expect(value).toBe("ana")
    })

    it("asks for approved rows plus the visitor's own pending ones, oldest first, capped", async () => {
      const { db, tx } = fakeDb()
      await new PrismaMemoryRepository(() => db as never).listForVisitor("ana")
      expect(tx.memory.findMany).toHaveBeenCalledWith({
        where: { OR: [{ status: "approved" }, { handle: "ana", status: "pending" }] },
        orderBy: [{ happenedOn: "asc" }, { createdAt: "asc" }],
        take: MEMORY_LIST_LIMIT,
      })
      expect(MEMORY_LIST_LIMIT).toBe(300)
    })

    it("maps rows to the domain", async () => {
      const { db } = fakeDb()
      expect(await new PrismaMemoryRepository(() => db as never).listForVisitor("ana")).toEqual([row])
    })

    it("returns an empty list when there are no rows", async () => {
      const { db } = fakeDb([])
      expect(await new PrismaMemoryRepository(() => db as never).listForVisitor("ana")).toEqual([])
    })
  })

  describe("createPending", () => {
    it("runs inside one transaction", async () => {
      const { db } = fakeDb()
      await new PrismaMemoryRepository(() => db as never).createPending("ana", input)
      expect(db.$transaction).toHaveBeenCalledTimes(1)
    })

    it("sets the visitor handle (parameterized) before inserting", async () => {
      const { db, calls } = fakeDb()
      await new PrismaMemoryRepository(() => db as never).createPending("ana", input)
      expect(calls.map((c) => c.name)).toEqual(["setConfig", "create"])
      const [sql, value] = calls[0].args as [string, string]
      expect(sql).toContain("set_config('app.handle'")
      expect(sql).toContain("true")
      expect(value).toBe("ana")
      expect(sql).not.toContain("ana")
    })

    it("inserts only the columns app_user may write: visitor-supplied and server-computed", async () => {
      const { db, tx } = fakeDb()
      await new PrismaMemoryRepository(() => db as never).createPending("ana", input)
      expect(tx.memory.create).toHaveBeenCalledWith({
        data: {
          handle: "ana",
          publicId: "memories/abc",
          caption: "hello",
          happenedOn: input.happenedOn,
          width: 10,
          height: 20,
          kind: "image",
          format: "jpg",
          bytes: 123_456,
          takenAt: input.takenAt,
          dominantColor: "#112233",
          palette: [{ color: "#112233", share: 40 }],
          metadata: { Make: "Apple" },
          latitude: 40.712812,
          longitude: -74.006009,
          placeName: "Nueva York",
          locationSource: "photo",
          orbColor: "#ff9a3c",
        },
      })
    })

    it("stores no location when there is none", async () => {
      const { db, tx } = fakeDb()
      await new PrismaMemoryRepository(() => db as never).createPending("ana", {
        ...input,
        takenAt: null,
        latitude: null,
        longitude: null,
        placeName: null,
        locationSource: null,
      })
      expect(tx.memory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ takenAt: null, latitude: null, longitude: null, placeName: null, locationSource: null }),
      })
    })

    it("reads decimal columns and JSON back as plain numbers, a clean palette and whitelisted metadata", async () => {
      const decimal = (n: number) => ({ valueOf: () => String(n), toString: () => String(n) })
      const { db } = fakeDb([
        {
          ...row,
          latitude: decimal(40.712812),
          longitude: decimal(-74.006009),
          palette: [{ color: "#112233", share: 40 }, "junk"],
          metadata: { Make: "Apple", GPSLatitude: "1", SerialNumber: "x" },
        },
      ])
      const [memory] = await new PrismaMemoryRepository(() => db as never).listForVisitor("ana")
      expect(memory.latitude).toBe(40.712812)
      expect(memory.longitude).toBe(-74.006009)
      expect(memory.palette).toEqual([{ color: "#112233", share: 40 }])
      expect(memory.metadata).toEqual({ Make: "Apple" })
      expect(memory.placeName).toBe("Nueva York")
      expect(memory.locationSource).toBe("photo")
      expect(memory.orbColor).toBe("#ff9a3c")
    })

    it("reads an older row with no orb color back as null", async () => {
      const { db } = fakeDb([{ ...row, orbColor: null }])
      const [memory] = await new PrismaMemoryRepository(() => db as never).listForVisitor("ana")
      expect(memory.orbColor).toBeNull()
    })

    it("maps the created row to the domain", async () => {
      const { db } = fakeDb()
      expect(
        await new PrismaMemoryRepository(() => db as never).createPending("ana", input),
      ).toEqual(row)
    })
  })
  describe("createPending duplicates", () => {
    it("turns a unique violation on public_id into a typed error", async () => {
      const { db, tx } = fakeDb()
      tx.memory.create.mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }))
      await expect(new PrismaMemoryRepository(() => db as never).createPending("ana", input)).rejects.toBeInstanceOf(
        DuplicatePublicIdError,
      )
    })

    it("lets any other error through untouched", async () => {
      const { db, tx } = fakeDb()
      const boom = Object.assign(new Error("boom"), { code: "P1001" })
      tx.memory.create.mockRejectedValueOnce(boom)
      await expect(new PrismaMemoryRepository(() => db as never).createPending("ana", input)).rejects.toBe(boom)
    })
  })

  describe("countRecentBy", () => {
    const since = new Date("2026-09-30T12:00:00.000Z")

    it("runs in one transaction that sets the handle before counting", async () => {
      const { db, calls } = fakeDb()
      await new PrismaMemoryRepository(() => db as never).countRecentBy("ana", since)
      expect(db.$transaction).toHaveBeenCalledTimes(1)
      expect(calls.map((c) => c.name)).toEqual(["setConfig", "count"])
      expect((calls[0].args as [string, string])[1]).toBe("ana")
    })

    it("counts the visitor's own rows of any status created since the cutoff", async () => {
      const { db, tx } = fakeDb()
      const count = await new PrismaMemoryRepository(() => db as never).countRecentBy("ana", since)
      expect(tx.memory.count).toHaveBeenCalledWith({ where: { handle: "ana", createdAt: { gte: since } } })
      expect(count).toBe(3)
    })
  })
})