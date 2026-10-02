// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { sharedAudioPath } from "./audio-path"
import { cloudinaryAudioUrl } from "./cloudinary-url"
import type { Memory } from "./memory"
import type { ApprovedMemoryReader } from "./memory-repository"
import { MAX_SLICE_BYTES, serveSharedAudioWith, type ServeSharedAudioDeps } from "./serve-audio"
import { signShareToken } from "./share/share-token"

const ID = "11111111-1111-4111-8111-111111111111"
const OTHER_ID = "22222222-2222-4222-8222-222222222222"
const AID = "my-life/memories/audio-9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"
const OTHER_AID = "my-life/memories/audio-00000000-0000-4000-8000-000000000000"
const API_SECRET = "very-secret-api-secret"
const SECRET = Buffer.alloc(32, 7).toString("base64url")
const TOKEN = signShareToken(ID, SECRET)

const memory = (id: string, audioId: string | null, over: Partial<Memory> = {}): Memory => ({
  id,
  handle: "ana",
  publicId: null,
  caption: "Una tarde",
  happenedOn: new Date("2024-03-12T00:00:00.000Z"),
  width: null,
  height: null,
  status: "approved",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  kind: "image",
  format: null,
  bytes: null,
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
  audio: audioId ? { publicId: audioId, format: "mka", bytes: 90_000_000, durationMs: 3_600_000 } : null,
  ...over,
})

const bytes = (size: number, from = 0) => Uint8Array.from({ length: size }, (_, i) => (from + i) % 251)
const upstream = (status: number, init: { body?: Uint8Array | null; headers?: Record<string, string> } = {}) =>
  new Response(init.body ? (init.body.slice().buffer as ArrayBuffer) : null, { status, headers: init.headers })

function setup(over: Partial<ServeSharedAudioDeps> = {}) {
  // Two approved memories exist: whichever id is asked for answers with its own audio.
  const memories = new Map([
    [ID, memory(ID, AID)],
    [OTHER_ID, memory(OTHER_ID, OTHER_AID)],
  ])
  const repository: ApprovedMemoryReader = { findApproved: vi.fn(async (id: string) => memories.get(id) ?? null) }
  const fetchFn = vi.fn<typeof fetch>(async () => upstream(200, { body: bytes(1000), headers: { "content-length": "1000" } }))
  const full: ServeSharedAudioDeps = {
    secret: SECRET,
    repository: () => repository,
    cloudinary: { cloudName: "demo", apiSecret: API_SECRET },
    fetch: fetchFn as unknown as typeof fetch,
    log: vi.fn(),
    ...over,
  }
  return { full, repository, fetchFn, memories }
}

const serve = (full: ServeSharedAudioDeps, range: string | null = null, token = TOKEN) =>
  serveSharedAudioWith(full, { token, range })

describe("sharedAudioPath", () => {
  it("is the guest route of the token", () => {
    expect(sharedAudioPath(TOKEN)).toBe(`/api/memories/shared/${TOKEN}/audio`)
  })
})

describe("serveSharedAudioWith: who may listen", () => {
  it("needs no session: the token is the only credential", async () => {
    const { full } = setup()
    expect((await serve(full)).status).toBe(200)
  })

  it.each(["", "garbage", "a.b", `${TOKEN}x`])("answers 404 for the token %j, touching neither the database nor Cloudinary", async (token) => {
    const { full, repository, fetchFn } = setup()
    const res = await serve(full, null, token)
    expect(res.status).toBe(404)
    expect(repository.findApproved).not.toHaveBeenCalled()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("answers 404 for a token signed with another secret", async () => {
    const { full, fetchFn } = setup()
    const res = await serve(full, null, signShareToken(ID, Buffer.alloc(32, 1).toString("base64url")))
    expect(res.status).toBe(404)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("serves only the audio of the memory the token names, never another memory's", async () => {
    const { full, repository, fetchFn } = setup()
    await serve(full)
    expect(repository.findApproved).toHaveBeenCalledTimes(1)
    expect(repository.findApproved).toHaveBeenCalledWith(ID)
    expect(fetchFn.mock.calls[0][0]).toBe(cloudinaryAudioUrl("demo", AID, API_SECRET))
    expect(String(fetchFn.mock.calls[0][0])).not.toContain("00000000-0000")
    // And the token of the other memory reaches the other one's audio, not this one's.
    await serve(full, null, signShareToken(OTHER_ID, SECRET))
    expect(fetchFn.mock.calls[1][0]).toBe(cloudinaryAudioUrl("demo", OTHER_AID, API_SECRET))
  })

  it("answers 404 when the memory is gone, not approved, or has no audio", async () => {
    const gone = setup()
    gone.memories.delete(ID)
    expect((await serve(gone.full)).status).toBe(404)

    const pending = setup()
    pending.memories.set(ID, memory(ID, AID, { status: "pending" }))
    expect((await serve(pending.full)).status).toBe(404)

    const silent = setup()
    silent.memories.set(ID, memory(ID, null, { publicId: "my-life/memories/p" }))
    expect((await serve(silent.full)).status).toBe(404)
    expect(silent.fetchFn).not.toHaveBeenCalled()
  })

  it("answers 503 when the secret or Cloudinary is not configured, or the database fails, without leaking", async () => {
    expect((await serve(setup({ secret: null }).full)).status).toBe(503)
    expect((await serve(setup({ cloudinary: null }).full)).status).toBe(503)
    const log = vi.fn()
    const { full, repository } = setup({ log })
    vi.mocked(repository.findApproved).mockRejectedValue(Object.assign(new Error("password=hunter2"), { name: "PrismaError" }))
    const res = await serve(full)
    expect(res.status).toBe(503)
    expect(JSON.stringify(log.mock.calls)).not.toContain("hunter2")
  })
})

describe("serveSharedAudioWith: the same streaming as the session route", () => {
  it("forwards a range to Cloudinary and answers 206 with Content-Range and Accept-Ranges", async () => {
    const { full, fetchFn } = setup()
    fetchFn.mockResolvedValueOnce(
      upstream(206, { body: bytes(100, 200), headers: { "content-range": "bytes 200-299/1000", "content-length": "100" } }),
    )
    const res = await serve(full, "bytes=200-299")
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ headers: { Range: "bytes=200-299" } })
    expect(res.status).toBe(206)
    expect(res.headers.get("content-range")).toBe("bytes 200-299/1000")
    expect(res.headers.get("accept-ranges")).toBe("bytes")
    expect(res.headers.get("content-type")).toBe("audio/mpeg")
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes(100, 200))
  })

  it("cuts the range itself when Cloudinary sends everything", async () => {
    const { full } = setup()
    const res = await serve(full, "bytes=10-19")
    expect(res.status).toBe(206)
    expect(res.headers.get("content-range")).toBe("bytes 10-19/1000")
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes(10, 10))
  })

  it("clamps the window to MAX_SLICE_BYTES", async () => {
    const { full, fetchFn } = setup()
    fetchFn.mockResolvedValueOnce(upstream(206, { body: bytes(1), headers: { "content-range": "bytes 0-0/1" } }))
    await serve(full, "bytes=0-")
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ headers: { Range: `bytes=0-${MAX_SLICE_BYTES - 1}` } })
  })

  it("answers 416 with the total when the range starts past the end", async () => {
    const { full } = setup()
    const res = await serve(full, "bytes=5000-")
    expect(res.status).toBe(416)
    expect(res.headers.get("content-range")).toBe("bytes */1000")
  })

  it("answers 503 with Retry-After and X-Audio-State processing while the audio is being made", async () => {
    const { full, fetchFn } = setup()
    fetchFn.mockResolvedValueOnce(upstream(423))
    const res = await serve(full)
    expect(res.status).toBe(503)
    expect(res.headers.get("retry-after")).toBe("10")
    expect(res.headers.get("x-audio-state")).toBe("processing")
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("never exposes the signed Cloudinary URL or its headers", async () => {
    const { full, fetchFn } = setup()
    fetchFn.mockResolvedValueOnce(upstream(200, { body: bytes(10), headers: { "set-cookie": "a=b", location: "https://res.cloudinary.com/x" } }))
    const res = await serve(full)
    expect([...res.headers.keys()].sort()).not.toContain("set-cookie")
    expect(res.headers.get("location")).toBeNull()
  })
})
