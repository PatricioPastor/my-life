import { describe, expect, it, vi } from "vitest"
import type { Memory } from "./memory"
import type { MemoryRepository } from "./memory-repository"
import { listMemoriesWith, type ListMemoriesDeps } from "./list-memories"

const memory = (over: Partial<Memory> = {}): Memory => ({
  id: "11111111-1111-4111-8111-111111111111",
  handle: "ana",
  publicId: "memories/a b",
  caption: "Una tarde",
  happenedOn: new Date("2024-03-12T00:00:00.000Z"),
  width: 800,
  height: 600,
  status: "approved",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  ...over,
})

function deps(over: Partial<ListMemoriesDeps> = {}, rows: Memory[] = [memory()]) {
  const repository: MemoryRepository = {
    listForVisitor: vi.fn(async () => rows),
    createPending: vi.fn(),
  }
  const full: ListMemoriesDeps = {
    currentVisitor: async () => ({ handle: "ana" }),
    repository: () => repository,
    cloudName: "demo",
    log: vi.fn(),
    ...over,
  }
  return { full, repository }
}

describe("listMemoriesWith", () => {
  it("answers no_session without touching the repository when nobody is admitted", async () => {
    const { full, repository } = deps({ currentVisitor: async () => null })
    expect(await listMemoriesWith(full)).toEqual({ ok: false, reason: "no_session" })
    expect(repository.listForVisitor).not.toHaveBeenCalled()
  })

  it("lists for the session's handle and maps rows to DTOs", async () => {
    const { full, repository } = deps()
    const result = await listMemoriesWith(full)
    expect(repository.listForVisitor).toHaveBeenCalledWith("ana")
    expect(result).toEqual({
      ok: true,
      memories: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          caption: "Una tarde",
          happenedOn: "2024-03-12",
          status: "approved",
          width: 800,
          height: 600,
          thumbUrl: "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_fill,g_auto,w_160,h_160/memories/a%20b",
          fullUrl: "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_1600/memories/a%20b",
        },
      ],
    })
  })

  it("never leaks the handle or the public id", async () => {
    const { full } = deps()
    const result = await listMemoriesWith(full)
    const json = JSON.stringify(result)
    expect(json).not.toContain("ana")
    expect(json).not.toContain("publicId")
  })

  it("keeps the repository's order and marks pending ones", async () => {
    const { full } = deps({}, [
      memory({ id: "a", status: "approved" }),
      memory({ id: "b", status: "pending" }),
    ])
    const result = await listMemoriesWith(full)
    expect(result.ok && result.memories.map((m) => [m.id, m.status])).toEqual([
      ["a", "approved"],
      ["b", "pending"],
    ])
  })

  it("drops rejected memories", async () => {
    const { full } = deps({}, [memory({ id: "a" }), memory({ id: "r", status: "rejected" })])
    const result = await listMemoriesWith(full)
    expect(result.ok && result.memories.map((m) => m.id)).toEqual(["a"])
  })

  it("answers unavailable, with one handle-free log line, when the repository throws", async () => {
    const log = vi.fn()
    const { full } = deps({
      log,
      repository: () => ({
        listForVisitor: async () => {
          throw new Error("DATABASE_URL uses ana's owner role")
        },
        createPending: vi.fn(),
      }),
    })
    expect(await listMemoriesWith(full)).toEqual({ ok: false, reason: "unavailable" })
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0][0])).not.toContain("ana")
  })

  it("answers unavailable when building the repository throws (the runtime guard)", async () => {
    const { full } = deps({
      repository: () => {
        throw new Error("guard")
      },
    })
    expect(await listMemoriesWith(full)).toEqual({ ok: false, reason: "unavailable" })
  })

  it("answers unavailable when the session lookup throws", async () => {
    const { full } = deps({
      currentVisitor: async () => {
        throw new Error("no request scope")
      },
    })
    expect(await listMemoriesWith(full)).toEqual({ ok: false, reason: "unavailable" })
  })

  it.each([undefined, ""])("answers unavailable without a cloud name (%j)", async (cloudName) => {
    const { full, repository } = deps({ cloudName })
    expect(await listMemoriesWith(full)).toEqual({ ok: false, reason: "unavailable" })
    expect(repository.listForVisitor).not.toHaveBeenCalled()
  })

  it("answers unavailable when a stored public id cannot make a URL", async () => {
    const { full } = deps({}, [memory({ publicId: "a/../b" })])
    expect(await listMemoriesWith(full)).toEqual({ ok: false, reason: "unavailable" })
  })
})
