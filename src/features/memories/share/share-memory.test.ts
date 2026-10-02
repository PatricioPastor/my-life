// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import type { Memory } from "../memory"
import type { MemoryRepository } from "../memory-repository"
import { shareMemoryWith, type ShareMemoryDeps } from "./share-memory"
import { verifyShareToken } from "./share-token"

const ID = "11111111-1111-4111-8111-111111111111"
const SECRET = Buffer.alloc(32, 7).toString("base64url")

const memory = (over: Partial<Memory> = {}): Memory => ({
  id: ID,
  handle: "ana",
  publicId: "my-life/memories/x",
  caption: "Una tarde",
  happenedOn: new Date("2024-03-12T00:00:00.000Z"),
  width: 10,
  height: 10,
  status: "approved",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  kind: "image",
  format: "jpg",
  bytes: 1,
  takenAt: null,
  dominantColor: null,
  palette: [],
  metadata: {},
  latitude: null,
  longitude: null,
  placeName: null,
  placeAddress: null,
  locationSource: null,
  orbColor: "#ff9a3c",
  viewCount: 0,
  relatedMemoryId: null,
  audio: null,
  ...over,
})

function setup(over: Partial<ShareMemoryDeps> = {}, found: Memory | null = memory()) {
  const repository: MemoryRepository = {
    listForVisitor: vi.fn(),
    findForVisitor: vi.fn(async () => found),
    createPending: vi.fn(),
    countRecentBy: vi.fn(),
  }
  const full: ShareMemoryDeps = {
    currentVisitor: async () => ({ handle: "ana" }),
    repository: () => repository,
    secret: SECRET,
    siteUrl: "https://example.com",
    log: vi.fn(),
    ...over,
  }
  return { full, repository }
}

describe("shareMemoryWith", () => {
  it("answers no_session without a session, and reads nothing", async () => {
    const { full, repository } = setup({ currentVisitor: async () => null })
    expect(await shareMemoryWith(full, { id: ID })).toEqual({ ok: false, reason: "no_session" })
    expect(repository.findForVisitor).not.toHaveBeenCalled()
  })

  it("answers not_shareable for an id that is not a uuid, without reading", async () => {
    const { full, repository } = setup()
    expect(await shareMemoryWith(full, { id: "nope" })).toEqual({ ok: false, reason: "not_shareable" })
    expect(repository.findForVisitor).not.toHaveBeenCalled()
  })

  it("answers not_shareable when the visitor cannot see the memory (it looks the same as a missing one)", async () => {
    const { full, repository } = setup({}, null)
    expect(await shareMemoryWith(full, { id: ID })).toEqual({ ok: false, reason: "not_shareable" })
    expect(repository.findForVisitor).toHaveBeenCalledWith("ana", ID)
  })

  it("refuses a pending memory, even the visitor's own", async () => {
    const { full } = setup({}, memory({ status: "pending" }))
    expect(await shareMemoryWith(full, { id: ID })).toEqual({ ok: false, reason: "not_shareable" })
  })

  it("refuses a rejected memory", async () => {
    const { full } = setup({}, memory({ status: "rejected" }))
    expect(await shareMemoryWith(full, { id: ID })).toEqual({ ok: false, reason: "not_shareable" })
  })

  it("returns an absolute url under /m/ whose token verifies to that memory", async () => {
    const { full } = setup()
    const result = await shareMemoryWith(full, { id: ID })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const url = new URL(result.url)
    expect(url.origin).toBe("https://example.com")
    expect(url.pathname.startsWith("/m/")).toBe(true)
    expect(verifyShareToken(url.pathname.slice(3), SECRET)).toBe(ID)
  })

  it("shares any approved memory with any visitor, not only their own", async () => {
    const { full } = setup({}, memory({ handle: "someone-else" }))
    expect((await shareMemoryWith(full, { id: ID })).ok).toBe(true)
  })

  it("answers unavailable, logging once, when the secret is missing", async () => {
    const { full } = setup({ secret: null })
    expect(await shareMemoryWith(full, { id: ID })).toEqual({ ok: false, reason: "unavailable" })
    expect(full.log).toHaveBeenCalledTimes(1)
  })

  it("answers unavailable when the database fails, logging only the error name", async () => {
    const { full, repository } = setup()
    vi.mocked(repository.findForVisitor).mockRejectedValue(new TypeError("password=hunter2"))
    expect(await shareMemoryWith(full, { id: ID })).toEqual({ ok: false, reason: "unavailable" })
    expect(vi.mocked(full.log).mock.calls[0][0]).toContain("TypeError")
    expect(vi.mocked(full.log).mock.calls[0][0]).not.toContain("hunter2")
  })
})
