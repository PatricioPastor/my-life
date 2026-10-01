import { describe, expect, it, vi } from "vitest"

// `server-only` throws outside the react-server condition; tests run in plain node.
vi.mock("server-only", () => ({}))

import { MEMORY_LIST_LIMIT, PrismaMemoryRepository } from "./prisma-memory-repository"
import type { NewMemoryInput } from "./memory"

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
    },
  }
  const db = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  }
  return { db, tx, calls }
}

const input: NewMemoryInput = {
  publicId: "memories/abc",
  caption: "hello",
  happenedOn: new Date("2024-06-15T00:00:00.000Z"),
  width: 10,
  height: 20,
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

    it("inserts only the visitor-controlled columns", async () => {
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
        },
      })
    })

    it("maps the created row to the domain", async () => {
      const { db } = fakeDb()
      expect(
        await new PrismaMemoryRepository(() => db as never).createPending("ana", input),
      ).toEqual(row)
    })
  })
})
