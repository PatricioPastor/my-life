// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import type { Memory } from "../memory"
import type { MemoryRepository, ViewRecorder } from "../memory-repository"
import { recordMemoryViewWith, type RecordViewDeps } from "./record-view"

const ID = "11111111-1111-4111-8111-111111111111"

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
  locationSource: null,
  orbColor: "#ff9a3c",
  viewCount: 0,
  audio: null,
  ...over,
})

function setup(over: Partial<RecordViewDeps> = {}, found: Memory | null = memory(), counted = true) {
  const repository: Pick<MemoryRepository, "findForVisitor"> & ViewRecorder = {
    findForVisitor: vi.fn(async () => found),
    recordView: vi.fn(async () => ({ counted })),
  }
  const full: RecordViewDeps = {
    // The visitor is "bea"; the memory above is ana's.
    currentVisitor: async () => ({ handle: "bea" }),
    repository: () => repository,
    log: vi.fn(),
    ...over,
  }
  return { full, repository }
}

describe("recordMemoryViewWith", () => {
  it("answers no_session without a session, and reads and writes nothing", async () => {
    const { full, repository } = setup({ currentVisitor: async () => null })
    expect(await recordMemoryViewWith(full, { id: ID })).toEqual({ ok: false, reason: "no_session" })
    expect(repository.findForVisitor).not.toHaveBeenCalled()
    expect(repository.recordView).not.toHaveBeenCalled()
  })

  it("answers not_countable for an id that is not a uuid, without touching the database", async () => {
    const { full, repository } = setup()
    for (const id of ["nope", "", "11111111-1111-4111-8111-11111111111", undefined as unknown as string]) {
      expect(await recordMemoryViewWith(full, { id }), String(id)).toEqual({ ok: false, reason: "not_countable" })
    }
    expect(await recordMemoryViewWith(full, undefined as unknown as { id: string })).toEqual({ ok: false, reason: "not_countable" })
    expect(repository.findForVisitor).not.toHaveBeenCalled()
    expect(repository.recordView).not.toHaveBeenCalled()
  })

  it("answers not_countable when the visitor cannot see the memory (it looks the same as a missing one)", async () => {
    const { full, repository } = setup({}, null)
    expect(await recordMemoryViewWith(full, { id: ID })).toEqual({ ok: false, reason: "not_countable" })
    expect(repository.findForVisitor).toHaveBeenCalledWith("bea", ID)
    expect(repository.recordView).not.toHaveBeenCalled()
  })

  it("does not count the author opening their own memory", async () => {
    const { full, repository } = setup({ currentVisitor: async () => ({ handle: "ana" }) })
    expect(await recordMemoryViewWith(full, { id: ID })).toEqual({ ok: false, reason: "not_countable" })
    expect(repository.recordView).not.toHaveBeenCalled()
  })

  it("does not count a pending memory (the visitor's own pending one is the only one they can see)", async () => {
    const { full, repository } = setup({ currentVisitor: async () => ({ handle: "ana" }) }, memory({ status: "pending" }))
    expect(await recordMemoryViewWith(full, { id: ID })).toEqual({ ok: false, reason: "not_countable" })
    expect(repository.recordView).not.toHaveBeenCalled()
  })

  it("does not count a rejected memory either", async () => {
    const { full, repository } = setup({}, memory({ status: "rejected" }))
    expect(await recordMemoryViewWith(full, { id: ID })).toEqual({ ok: false, reason: "not_countable" })
    expect(repository.recordView).not.toHaveBeenCalled()
  })

  it("records an approved memory of someone else, and says the visitor was counted for the first time", async () => {
    const { full, repository } = setup({}, memory(), true)
    expect(await recordMemoryViewWith(full, { id: ID })).toEqual({ ok: true, counted: true })
    expect(repository.recordView).toHaveBeenCalledTimes(1)
    expect(repository.recordView).toHaveBeenCalledWith("bea", ID)
  })

  it("records a repeat open, and says the visitor had already been counted", async () => {
    const { full } = setup({}, memory(), false)
    expect(await recordMemoryViewWith(full, { id: ID })).toEqual({ ok: true, counted: false })
  })

  it("takes the handle from the session, never from the input", async () => {
    const { full, repository } = setup()
    await recordMemoryViewWith(full, { id: ID, handle: "mallory" } as { id: string })
    expect(repository.recordView).toHaveBeenCalledWith("bea", ID)
  })

  it("answers unavailable, logging only the error name, when the database fails", async () => {
    const { full, repository } = setup()
    vi.mocked(repository.recordView).mockRejectedValue(new TypeError("password=hunter2"))
    expect(await recordMemoryViewWith(full, { id: ID })).toEqual({ ok: false, reason: "unavailable" })
    expect(full.log).toHaveBeenCalledTimes(1)
    expect(vi.mocked(full.log).mock.calls[0][0]).toContain("TypeError")
    expect(vi.mocked(full.log).mock.calls[0][0]).not.toContain("hunter2")
  })

  it("answers unavailable when building the repository fails (the runtime-role guard)", async () => {
    const { full } = setup({
      repository: () => {
        throw new Error("not app_user")
      },
    })
    expect(await recordMemoryViewWith(full, { id: ID })).toEqual({ ok: false, reason: "unavailable" })
  })

  it("never throws, even when the session lookup does", async () => {
    const { full } = setup({
      currentVisitor: async () => {
        throw new Error("boom")
      },
    })
    await expect(recordMemoryViewWith(full, { id: ID })).resolves.toEqual({ ok: false, reason: "unavailable" })
  })
})
