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
  viewCount: 7,
  audioPublicId: null as string | null,
  audioFormat: null as string | null,
  audioBytes: null as number | null,
  audioDurationMs: null as number | null,
}

/** What the domain holds for `row`: the four audio columns become one `audio` value. */
const domainRow = (() => {
  const { audioPublicId: _a, audioFormat: _b, audioBytes: _c, audioDurationMs: _d, ...rest } = row
  void [_a, _b, _c, _d]
  return { ...rest, audio: null }
})()

/** Minimal fake of the Prisma surface the adapter touches, recording call order. */
function fakeDb(rows: unknown[] = [row], one: unknown = row, upsertRows: unknown[] = [{ open_count: 1 }]) {
  const calls: Array<{ name: string; args: unknown[] }> = []
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?")
      const isSetConfig = sql.includes("set_config(")
      calls.push({ name: isSetConfig ? "setConfig" : "rawQuery", args: [sql, ...values] })
      return isSetConfig ? [] : upsertRows
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
      findFirst: vi.fn(async (arg: unknown) => {
        calls.push({ name: "findFirst", args: [arg] })
        return one
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
  audio: null,
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
      expect(await new PrismaMemoryRepository(() => db as never).listForVisitor("ana")).toEqual([domainRow])
    })

    it("returns an empty list when there are no rows", async () => {
      const { db } = fakeDb([])
      expect(await new PrismaMemoryRepository(() => db as never).listForVisitor("ana")).toEqual([])
    })
  })

  describe("findForVisitor", () => {
    const ID = "11111111-1111-4111-8111-111111111111"

    it("runs in one transaction that sets the handle before reading, so row-level security decides", async () => {
      const { db, calls } = fakeDb()
      await new PrismaMemoryRepository(() => db as never).findForVisitor("ana", ID)
      expect(db.$transaction).toHaveBeenCalledTimes(1)
      expect(calls.map((c) => c.name)).toEqual(["setConfig", "findFirst"])
      expect(calls[0].args[1]).toBe("ana")
    })

    it("asks for that id among the approved rows and the visitor's own pending ones, like the listing", async () => {
      const { db, tx } = fakeDb()
      await new PrismaMemoryRepository(() => db as never).findForVisitor("ana", ID)
      expect(tx.memory.findFirst).toHaveBeenCalledWith({
        where: { id: ID, OR: [{ status: "approved" }, { handle: "ana", status: "pending" }] },
      })
    })

    it("maps the row to the domain, and answers null when the visitor may not see one", async () => {
      expect(await new PrismaMemoryRepository(() => fakeDb().db as never).findForVisitor("ana", ID)).toEqual(domainRow)
      expect(await new PrismaMemoryRepository(() => fakeDb([], null).db as never).findForVisitor("ana", ID)).toBeNull()
    })
  })

  describe("findApproved (a guest, with a share link)", () => {
    const ID = "11111111-1111-4111-8111-111111111111"

    it("reads inside one transaction with an empty handle, so row-level security only lets approved rows through", async () => {
      const { db, calls } = fakeDb()
      await new PrismaMemoryRepository(() => db as never).findApproved(ID)
      expect(db.$transaction).toHaveBeenCalledTimes(1)
      expect(calls.map((c) => c.name)).toEqual(["setConfig", "findFirst"])
      expect(calls[0].args[1]).toBe("")
    })

    it("asks for that id among the approved rows only, restating the policy", async () => {
      const { db, tx } = fakeDb()
      await new PrismaMemoryRepository(() => db as never).findApproved(ID)
      expect(tx.memory.findFirst).toHaveBeenCalledWith({ where: { id: ID, status: "approved" } })
    })

    it("maps the row to the domain, and answers null when there is none", async () => {
      expect(await new PrismaMemoryRepository(() => fakeDb().db as never).findApproved(ID)).toEqual(domainRow)
      expect(await new PrismaMemoryRepository(() => fakeDb([], null).db as never).findApproved(ID)).toBeNull()
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
          audioPublicId: null,
          audioFormat: null,
          audioBytes: null,
          audioDurationMs: null,
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
      ).toEqual(domainRow)
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
describe("PrismaMemoryRepository: audio", () => {
  const audioRow = {
    ...row,
    publicId: null,
    width: null,
    height: null,
    format: null,
    bytes: null,
    dominantColor: null,
    audioPublicId: "my-life/memories/audio-1",
    audioFormat: "webm",
    audioBytes: 2000,
    audioDurationMs: 4500,
  }

  it("maps the audio columns into one audio value, and a photo-less row to null photo fields", async () => {
    const { db } = fakeDb([audioRow])
    const [memory] = await new PrismaMemoryRepository(() => db as never).listForVisitor("ana")
    expect(memory).toMatchObject({
      publicId: null,
      width: null,
      height: null,
      audio: { publicId: "my-life/memories/audio-1", format: "webm", bytes: 2000, durationMs: 4500 },
    })
  })

  it("maps a photo-only row to a null audio", async () => {
    const { db } = fakeDb([row])
    const [memory] = await new PrismaMemoryRepository(() => db as never).listForVisitor("ana")
    expect(memory.audio).toBeNull()
  })

  it("writes the audio columns, and null photo columns, for an audio-only memory", async () => {
    const { db, tx } = fakeDb()
    await new PrismaMemoryRepository(() => db as never).createPending("ana", {
      ...input,
      publicId: null,
      width: null,
      height: null,
      format: null,
      bytes: null,
      dominantColor: null,
      palette: [],
      metadata: {},
      latitude: null,
      longitude: null,
      placeName: null,
      locationSource: null,
      takenAt: null,
      audio: { publicId: "my-life/memories/audio-1", format: "webm", bytes: 2000, durationMs: 4500 },
    })
    const data = (tx.memory.create.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({
      publicId: null,
      width: null,
      height: null,
      audioPublicId: "my-life/memories/audio-1",
      audioFormat: "webm",
      audioBytes: 2000,
      audioDurationMs: 4500,
    })
  })

  it("writes null audio columns for a photo-only memory", async () => {
    const { db, tx } = fakeDb()
    await new PrismaMemoryRepository(() => db as never).createPending("ana", input)
    const data = (tx.memory.create.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({ audioPublicId: null, audioFormat: null, audioBytes: null, audioDurationMs: null })
  })

  it("answers a duplicate when the audio public id is already taken too (P2002)", async () => {
    const { db, tx } = fakeDb()
    tx.memory.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }))
    await expect(new PrismaMemoryRepository(() => db as never).createPending("ana", input)).rejects.toBeInstanceOf(
      DuplicatePublicIdError,
    )
  })
})

describe("PrismaMemoryRepository: views", () => {
  const ID = "11111111-1111-4111-8111-111111111111"

  it("reads the view count of a row into the domain", async () => {
    const { db } = fakeDb()
    const [memory] = await new PrismaMemoryRepository(() => db as never).listForVisitor("ana")
    expect(memory.viewCount).toBe(7)
  })

  describe("recordView", () => {
    it("runs in one transaction that sets the visitor handle before the upsert", async () => {
      const { db, calls } = fakeDb()
      await new PrismaMemoryRepository(() => db as never).recordView("bea", ID)
      expect(db.$transaction).toHaveBeenCalledTimes(1)
      expect(calls.map((c) => c.name)).toEqual(["setConfig", "rawQuery"])
      expect(calls[0].args[1]).toBe("bea")
    })

    it("is one parameterized upsert: a new pair inserts, a known one bumps last_viewed_at and open_count", async () => {
      const { db, calls } = fakeDb()
      await new PrismaMemoryRepository(() => db as never).recordView("bea", ID)
      const [sql, ...values] = calls[1].args as [string, ...unknown[]]
      const flat = sql.replace(/\s+/g, " ")
      expect(flat).toContain("INSERT INTO memory_views (memory_id, handle)")
      expect(flat).toContain("ON CONFLICT (memory_id, handle) DO UPDATE")
      expect(flat).toContain("last_viewed_at = now()")
      expect(flat).toContain("open_count = memory_views.open_count + 1")
      expect(flat).toContain("RETURNING open_count")
      // Neither the handle nor the id is spliced into the text.
      expect(sql).not.toContain("bea")
      expect(sql).not.toContain(ID)
      expect(values).toEqual([ID, "bea"])
    })

    it("answers counted when the row was inserted (open_count 1) and not when it already existed", async () => {
      const first = fakeDb([row], row, [{ open_count: 1 }]).db
      expect(await new PrismaMemoryRepository(() => first as never).recordView("bea", ID)).toEqual({ counted: true })
      const again = fakeDb([row], row, [{ open_count: 4 }]).db
      expect(await new PrismaMemoryRepository(() => again as never).recordView("bea", ID)).toEqual({ counted: false })
    })

    it("answers not counted when the statement returns nothing", async () => {
      const { db } = fakeDb([row], row, [])
      expect(await new PrismaMemoryRepository(() => db as never).recordView("bea", ID)).toEqual({ counted: false })
    })

    it("treats a row-level security refusal (the author, a pending memory) as a quiet no-op", async () => {
      for (const error of [
        Object.assign(new Error("new row violates row-level security policy for table memory_views"), { code: "P2010" }),
        Object.assign(new Error("Raw query failed"), { code: "P2010", meta: { code: "42501", message: "denied" } }),
        Object.assign(new Error("denied"), { code: "42501" }),
      ]) {
        const { db, tx } = fakeDb()
        tx.$queryRaw.mockImplementationOnce(async () => []).mockRejectedValueOnce(error)
        expect(await new PrismaMemoryRepository(() => db as never).recordView("ana", ID)).toEqual({ counted: false })
      }
    })

    it("lets any other failure through, for the caller to log", async () => {
      const { db, tx } = fakeDb()
      const boom = Object.assign(new Error("connection lost"), { code: "P1001" })
      tx.$queryRaw.mockImplementationOnce(async () => []).mockRejectedValueOnce(boom)
      await expect(new PrismaMemoryRepository(() => db as never).recordView("bea", ID)).rejects.toBe(boom)
    })
  })
})
