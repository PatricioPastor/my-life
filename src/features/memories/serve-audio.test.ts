// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { memoryAudioPath } from "./audio-path"
import { cloudinaryAudioUrl } from "./cloudinary-url"
import type { Memory } from "./memory"
import type { MemoryRepository } from "./memory-repository"
import { MAX_SLICE_BYTES, parseRange, serveAudioWith, type ServeAudioDeps } from "./serve-audio"

const ID = "11111111-1111-4111-8111-111111111111"
const AID = "my-life/memories/audio-9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"
const SECRET = "very-secret-api-secret"
const SIGNED = cloudinaryAudioUrl("demo", AID, SECRET)

const memory = (over: Partial<Memory> = {}): Memory => ({
  id: ID,
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
  locationSource: null,
  orbColor: "#ff9a3c",
  audio: { publicId: AID, format: "mka", bytes: 90_000_000, durationMs: 3_600_000 },
  ...over,
})

/** A body of `size` bytes where byte i is `i % 251`, so a slice can be checked by value. */
const bytes = (size: number, from = 0) => Uint8Array.from({ length: size }, (_, i) => (from + i) % 251)

function upstream(status: number, init: { body?: Uint8Array | null; headers?: Record<string, string> } = {}) {
  return new Response(init.body ? (init.body.slice().buffer as ArrayBuffer) : null, { status, headers: init.headers })
}

function setup(over: Partial<ServeAudioDeps> = {}, found: Memory | null = memory()) {
  const repository: MemoryRepository = {
    listForVisitor: vi.fn(),
    findForVisitor: vi.fn(async () => found),
    createPending: vi.fn(),
    countRecentBy: vi.fn(),
  }
  const fetchFn = vi.fn<typeof fetch>(async () => upstream(200, { body: bytes(1000), headers: { "content-length": "1000" } }))
  const full: ServeAudioDeps = {
    currentVisitor: async () => ({ handle: "ana" }),
    repository: () => repository,
    cloudinary: { cloudName: "demo", apiSecret: SECRET },
    fetch: fetchFn as unknown as typeof fetch,
    log: vi.fn(),
    ...over,
  }
  return { full, repository, fetchFn }
}

const serve = (full: ServeAudioDeps, range: string | null = null, id = ID, signal?: AbortSignal) =>
  serveAudioWith(full, { id, range, signal })
const body = async (res: Response) => new Uint8Array(await res.arrayBuffer())

describe("memoryAudioPath", () => {
  it("is the route the audio of a memory is played from", () => {
    expect(memoryAudioPath(ID)).toBe(`/api/memories/${ID}/audio`)
    expect(memoryAudioPath("a b")).toBe("/api/memories/a%20b/audio")
  })
})

describe("parseRange", () => {
  it.each([
    ["bytes=0-99", { start: 0, end: 99 }],
    ["bytes=500-", { start: 500, end: null }],
    ["bytes=0-", { start: 0, end: null }],
    ["bytes=-200", { suffix: 200 }],
    ["  bytes=10-20 ", { start: 10, end: 20 }],
  ])("reads %s", (header, expected) => {
    expect(parseRange(header)).toEqual(expected)
  })

  it.each([null, "", "bytes=", "bytes=-", "bytes=a-b", "bytes=10-5", "items=0-9", "bytes=0-9,20-29", "bytes=-0", "bytes=1-2-3"])(
    "ignores %s (the whole audio is sent)",
    (header) => {
      expect(parseRange(header)).toBeNull()
    },
  )
})

describe("serveAudioWith: who may listen", () => {
  it("answers 401 without a session, and touches neither the database nor Cloudinary", async () => {
    const { full, repository, fetchFn } = setup({ currentVisitor: async () => null })
    const res = await serve(full)
    expect(res.status).toBe(401)
    expect(repository.findForVisitor).not.toHaveBeenCalled()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("looks the memory up as the visitor, so row-level security decides which ones exist for them", async () => {
    const { full, repository } = setup()
    await serve(full)
    expect(repository.findForVisitor).toHaveBeenCalledWith("ana", ID)
  })

  it("answers 404, and fetches nothing, when the visitor cannot see the memory (or it does not exist)", async () => {
    const { full, fetchFn } = setup({}, null)
    const res = await serve(full)
    expect(res.status).toBe(404)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("answers 404 for a memory that has no audio", async () => {
    const { full, fetchFn } = setup({}, memory({ audio: null }))
    expect((await serve(full)).status).toBe(404)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("answers 404 for a rejected memory even if the database handed it over", async () => {
    const { full, fetchFn } = setup({}, memory({ status: "rejected" }))
    expect((await serve(full)).status).toBe(404)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("answers 404 for an id that is not a uuid, without reaching the database", async () => {
    const { full, repository } = setup()
    expect((await serve(full, null, "../../etc/passwd")).status).toBe(404)
    expect((await serve(full, null, "a")).status).toBe(404)
    expect(repository.findForVisitor).not.toHaveBeenCalled()
  })

  it("serves the visitor's own pending memory (the repository already limited it to theirs)", async () => {
    const { full } = setup({}, memory({ status: "pending" }))
    expect((await serve(full)).status).toBe(200)
  })

  it("answers 503 when Cloudinary is not configured", async () => {
    const { full, fetchFn } = setup({ cloudinary: null })
    expect((await serve(full)).status).toBe(503)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("answers 503 and logs one line without personal data when the database fails", async () => {
    const log = vi.fn()
    const { full } = setup({
      log,
      repository: () => ({
        listForVisitor: vi.fn(),
        findForVisitor: async () => {
          throw new Error("ana: postgres://secret")
        },
        createPending: vi.fn(),
        countRecentBy: vi.fn(),
      }),
    })
    expect((await serve(full)).status).toBe(503)
    expect(log).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/ana|postgres/)
  })
})

describe("serveAudioWith: what it asks Cloudinary for", () => {
  it("fetches the signed mp3 transcode of that audio, server-side", async () => {
    const { full, fetchFn } = setup()
    await serve(full)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0][0]).toBe(SIGNED)
  })

  it("forwards a byte range, and no range when the browser sent none", async () => {
    const { full, fetchFn } = setup()
    await serve(full, "bytes=100-199")
    expect(new Headers(fetchFn.mock.calls[0][1]?.headers).get("range")).toBe("bytes=100-199")
    await serve(full)
    expect(new Headers(fetchFn.mock.calls[1][1]?.headers).get("range")).toBeNull()
  })

  it("asks for a window, not the whole file, when the range is open-ended or too big, so one request stays short", async () => {
    const { full, fetchFn } = setup()
    await serve(full, "bytes=0-")
    expect(new Headers(fetchFn.mock.calls[0][1]?.headers).get("range")).toBe(`bytes=0-${MAX_SLICE_BYTES - 1}`)
    await serve(full, "bytes=1000-")
    expect(new Headers(fetchFn.mock.calls[1][1]?.headers).get("range")).toBe(`bytes=1000-${1000 + MAX_SLICE_BYTES - 1}`)
    await serve(full, "bytes=0-999999999")
    expect(new Headers(fetchFn.mock.calls[2][1]?.headers).get("range")).toBe(`bytes=0-${MAX_SLICE_BYTES - 1}`)
    await serve(full, "bytes=-999999999")
    expect(new Headers(fetchFn.mock.calls[3][1]?.headers).get("range")).toBe(`bytes=-${MAX_SLICE_BYTES}`)
    expect(MAX_SLICE_BYTES).toBe(8 * 1024 * 1024)
  })

  it("passes the request's abort signal on, so closing the player closes the Cloudinary request", async () => {
    const { full, fetchFn } = setup()
    const controller = new AbortController()
    await serve(full, null, ID, controller.signal)
    expect(fetchFn.mock.calls[0][1]?.signal).toBe(controller.signal)
  })
})

describe("serveAudioWith: the answer", () => {
  it("relays Cloudinary's 206 with its Content-Range, length and bytes, and the headers Safari needs", async () => {
    const { full, fetchFn } = setup()
    fetchFn.mockResolvedValueOnce(
      upstream(206, {
        body: bytes(100, 100),
        headers: { "content-range": "bytes 100-199/5000", "content-length": "100", "content-type": "audio/mpeg" },
      }),
    )
    const res = await serve(full, "bytes=100-199")
    expect(res.status).toBe(206)
    expect(res.headers.get("content-range")).toBe("bytes 100-199/5000")
    expect(res.headers.get("content-length")).toBe("100")
    expect(res.headers.get("accept-ranges")).toBe("bytes")
    expect(res.headers.get("content-type")).toBe("audio/mpeg")
    expect(res.headers.get("cache-control")).toMatch(/^private, max-age=\d+/)
    expect(await body(res)).toEqual(bytes(100, 100))
  })

  it("answers audio/mpeg whatever type Cloudinary labelled it with", async () => {
    const { full, fetchFn } = setup()
    fetchFn.mockResolvedValueOnce(upstream(200, { body: bytes(10), headers: { "content-type": "application/octet-stream", "content-length": "10" } }))
    expect((await serve(full)).headers.get("content-type")).toBe("audio/mpeg")
  })

  it("answers 200 with the whole audio, and Accept-Ranges, when the browser sent no range", async () => {
    const { full } = setup()
    const res = await serve(full)
    expect(res.status).toBe(200)
    expect(res.headers.get("accept-ranges")).toBe("bytes")
    expect(res.headers.get("content-length")).toBe("1000")
    expect(await body(res)).toEqual(bytes(1000))
  })

  it("cuts the range itself when Cloudinary ignores it and sends everything: 206 with the right bytes and Content-Range", async () => {
    const { full } = setup()
    const res = await serve(full, "bytes=100-199")
    expect(res.status).toBe(206)
    expect(res.headers.get("content-range")).toBe("bytes 100-199/1000")
    expect(res.headers.get("content-length")).toBe("100")
    expect(await body(res)).toEqual(bytes(100, 100))
  })

  it("cuts open-ended and suffix ranges the same way", async () => {
    const { full } = setup()
    const open = await serve(full, "bytes=900-")
    expect(open.status).toBe(206)
    expect(open.headers.get("content-range")).toBe("bytes 900-999/1000")
    expect(await body(open)).toEqual(bytes(100, 900))

    const suffix = await serve(full, "bytes=-50")
    expect(suffix.headers.get("content-range")).toBe("bytes 950-999/1000")
    expect(await body(suffix)).toEqual(bytes(50, 950))
  })

  it("clamps an end past the file to the file", async () => {
    const { full } = setup()
    const res = await serve(full, "bytes=990-5000")
    expect(res.headers.get("content-range")).toBe("bytes 990-999/1000")
    expect(await body(res)).toEqual(bytes(10, 990))
  })

  it("answers 416 with the size when the range starts past the end", async () => {
    const { full } = setup()
    const res = await serve(full, "bytes=1000-")
    expect(res.status).toBe(416)
    expect(res.headers.get("content-range")).toBe("bytes */1000")
  })

  it("relays Cloudinary's own 416", async () => {
    const { full, fetchFn } = setup()
    fetchFn.mockResolvedValueOnce(upstream(416, { headers: { "content-range": "bytes */1000" } }))
    const res = await serve(full, "bytes=5000-")
    expect(res.status).toBe(416)
    expect(res.headers.get("content-range")).toBe("bytes */1000")
  })

  it("never shows the signed URL, the API secret or Cloudinary's headers", async () => {
    const { full, fetchFn } = setup()
    fetchFn.mockResolvedValueOnce(
      upstream(206, {
        body: bytes(10),
        headers: { "content-range": "bytes 0-9/10", "content-length": "10", location: SIGNED, "set-cookie": "a=b", "x-cld-request-id": "r" },
      }),
    )
    const res = await serve(full, "bytes=0-9")
    const all = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n")
    expect(all).not.toMatch(/s--|cloudinary|abcd|very-secret|set-cookie|location|x-cld/i)
    expect(all).not.toContain(SIGNED)
  })
})

describe("serveAudioWith: when the audio is not ready or Cloudinary fails", () => {
  const processing = (res: Response) => {
    expect(res.status).toBe(503)
    expect(res.headers.get("retry-after")).toMatch(/^\d+$/)
    expect(res.headers.get("x-audio-state")).toBe("processing")
    expect(res.headers.get("cache-control")).toBe("no-store")
  }

  it("says it is still processing (503 + Retry-After) while Cloudinary answers 423, the status it uses for a derivative in the making", async () => {
    const { full, fetchFn } = setup()
    fetchFn.mockResolvedValueOnce(upstream(423, { headers: { "x-cld-error": "Video tracking-crop is pending" } }))
    processing(await serve(full, "bytes=0-"))
  })

  it("says the same when Cloudinary refuses to transcode on the fly a video that is too large (the eager one is not done yet)", async () => {
    const { full, fetchFn } = setup()
    fetchFn.mockResolvedValueOnce(
      upstream(400, { headers: { "x-cld-error": "Video is too large to process synchronously, please use an eager transformation with eager_async=true to resolve" } }),
    )
    processing(await serve(full))
  })

  it("answers 404 when Cloudinary no longer has the asset", async () => {
    const { full, fetchFn } = setup()
    fetchFn.mockResolvedValueOnce(upstream(404))
    expect((await serve(full)).status).toBe(404)
  })

  it.each([400, 401, 403, 500, 502, 503])("answers 502 when Cloudinary answers %s for another reason", async (status) => {
    const { full, fetchFn } = setup()
    fetchFn.mockResolvedValueOnce(upstream(status, { headers: { "x-cld-error": "Something else" } }))
    const res = await serve(full)
    expect(res.status).toBe(502)
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("answers 502 when the request to Cloudinary fails, logging only the error name", async () => {
    const log = vi.fn()
    const { full, fetchFn } = setup({ log })
    fetchFn.mockRejectedValueOnce(Object.assign(new Error(`failed: ${SIGNED}`), { name: "TypeError" }))
    expect((await serve(full)).status).toBe(502)
    expect(log).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/s--|very-secret|cloudinary/)
  })

  it("does not cache a failure", async () => {
    const { full, fetchFn } = setup()
    fetchFn.mockResolvedValueOnce(upstream(423))
    expect((await serve(full)).headers.get("cache-control")).toBe("no-store")
  })
})
