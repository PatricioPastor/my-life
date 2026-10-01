import { describe, expect, it, vi } from "vitest"
import { CHUNK_SIZE } from "./chunk-plan"
import { uploadInChunks, backoffMs, type ChunkRequest, type ChunkResponse, type SendChunk } from "./chunked-upload"

const URL = "https://api.cloudinary.com/v1_1/demo/video/upload"
const FIELDS = {
  api_key: "k",
  timestamp: "1800000000",
  signature: "s",
  public_id: "my-life/memories/audio-x",
  eager: "f_mp3",
  eager_async: "true",
  overwrite: "false",
  type: "authenticated",
}
const TOTAL = 20_000_001 // 4 chunks: 6,000,000 x3 and 2,000,001
const file = (size = TOTAL) => new Blob([new Uint8Array(size)], { type: "audio/mpeg" })

const noSleep = vi.fn(async () => {})

function setup(
  responses: ChunkResponse[] | ((req: ChunkRequest, call: number) => ChunkResponse | Promise<ChunkResponse>),
  size = TOTAL,
) {
  const calls: ChunkRequest[] = []
  const send: SendChunk = async (req) => {
    calls.push(req)
    const n = calls.length - 1
    return typeof responses === "function" ? responses(req, n) : (responses[n] ?? { kind: "ok" })
  }
  const onProgress = vi.fn()
  const run = (over: Partial<Parameters<typeof uploadInChunks>[0]> = {}) =>
    uploadInChunks({
      file: file(size),
      name: "recuerdo.mp3",
      url: URL,
      fields: FIELDS,
      uploadId: "upload-1",
      onProgress,
      send,
      sleep: noSleep,
      ...over,
    })
  return { calls, onProgress, run }
}

describe("uploadInChunks", () => {
  it("posts every chunk to the upload URL with the same signed fields and the same unique upload id", async () => {
    const { calls, run } = setup([])
    expect(await run()).toEqual({ ok: true })
    expect(calls).toHaveLength(4)
    for (const call of calls) {
      expect(call.url).toBe(URL)
      expect(call.headers["X-Unique-Upload-Id"]).toBe("upload-1")
      for (const [key, value] of Object.entries(FIELDS)) expect(call.form.get(key)).toBe(value)
      expect(call.form.get("file")).toBeInstanceOf(Blob)
    }
    // The ticket (or anything else the server did not sign) is never sent.
    expect(calls[0].form.has("ticket")).toBe(false)
  })

  it("sends the documented Content-Range for each chunk, in order, with the right bytes", async () => {
    const { calls, run } = setup([])
    await run()
    expect(calls.map((c) => c.headers["Content-Range"])).toEqual([
      "bytes 0-5999999/20000001",
      "bytes 6000000-11999999/20000001",
      "bytes 12000000-17999999/20000001",
      "bytes 18000000-20000000/20000001",
    ])
    expect(calls.map((c) => (c.form.get("file") as Blob).size)).toEqual([6_000_000, 6_000_000, 6_000_000, 2_000_001])
    expect(CHUNK_SIZE).toBe(6_000_000)
  })

  it("names the part in the form so Cloudinary has a file name", async () => {
    const { calls, run } = setup([])
    await run()
    expect((calls[0].form.get("file") as File).name).toBe("recuerdo.mp3")
  })

  it("makes up an upload id when none is given, the same for every chunk", async () => {
    const { calls, run } = setup([])
    await run({ uploadId: undefined })
    const ids = new Set(calls.map((c) => c.headers["X-Unique-Upload-Id"]))
    expect(ids.size).toBe(1)
    expect([...ids][0]).toMatch(/\S{8,}/)
  })

  it("aggregates progress across chunks: bytes sent over the whole file, never going back", async () => {
    const { onProgress, run } = setup(async (req) => {
      // Half of each chunk goes, then the rest.
      const size = (req.form.get("file") as Blob).size
      req.onProgress(Math.floor(size / 2))
      req.onProgress(size)
      return { kind: "ok" }
    })
    await run()
    const percents = onProgress.mock.calls.map(([p]) => p as number)
    expect(percents).toEqual([...percents].sort((a, b) => a - b))
    expect(percents.at(-1)).toBe(100)
    // 3 MB of the 20 MB, half way through the first chunk.
    expect(percents).toContain(15)
    // 6 MB of the 20 MB, the first chunk done.
    expect(percents).toContain(30)
    expect(Math.max(...percents.slice(0, -1))).toBeLessThanOrEqual(99)
  })

  it("does not let a retried chunk move the bar back", async () => {
    let first = true
    const { onProgress, run } = setup(async (req) => {
      const size = (req.form.get("file") as Blob).size
      req.onProgress(size)
      if (first) {
        first = false
        return { kind: "retry" }
      }
      return { kind: "ok" }
    })
    await run()
    const percents = onProgress.mock.calls.map(([p]) => p as number)
    expect(percents).toEqual([...percents].sort((a, b) => a - b))
  })

  it("clamps what a chunk reports to the chunk (multipart overhead counts in the browser)", async () => {
    const { onProgress, run } = setup(async (req) => {
      req.onProgress((req.form.get("file") as Blob).size + 500)
      return { kind: "ok" }
    })
    await run()
    expect(Math.max(...onProgress.mock.calls.map(([p]) => p as number))).toBe(100)
  })

  describe("retry", () => {
    it("retries a chunk that fails to get through, with the same range and id, and carries on", async () => {
      const { calls, run } = setup([{ kind: "ok" }, { kind: "retry" }, { kind: "retry" }, { kind: "ok" }])
      expect(await run()).toEqual({ ok: true })
      expect(calls).toHaveLength(6)
      expect(calls[1].headers["Content-Range"]).toBe(calls[2].headers["Content-Range"])
      expect(calls[2].headers["Content-Range"]).toBe(calls[3].headers["Content-Range"])
      expect(calls[1].headers["X-Unique-Upload-Id"]).toBe(calls[3].headers["X-Unique-Upload-Id"])
    })

    it("waits with an increasing backoff between attempts, 1 s, 2 s, 4 s", async () => {
      const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {})
      const { run } = setup([{ kind: "retry" }, { kind: "retry" }, { kind: "retry" }, { kind: "ok" }])
      await run({ sleep })
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000])
    })

    it("gives up on a chunk after 4 attempts and fails the upload without sending the rest", async () => {
      const { calls, run } = setup(() => ({ kind: "retry" }))
      expect(await run()).toEqual({ ok: false, reason: "failed" })
      expect(calls).toHaveLength(4)
      expect(new Set(calls.map((c) => c.headers["Content-Range"])).size).toBe(1)
    })

    it("does not retry an answer that cannot get better (a bad signature, a file too big)", async () => {
      const { calls, run } = setup([{ kind: "ok" }, { kind: "fatal" }])
      expect(await run()).toEqual({ ok: false, reason: "failed" })
      expect(calls).toHaveLength(2)
    })

    it("backs off 1 s, 2 s, 4 s, then no more than 8 s", () => {
      expect([1, 2, 3, 4, 5, 6].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 8000, 8000])
    })
  })

  describe("cancel", () => {
    it("stops before the next chunk when the signal aborts, and reports it cancelled", async () => {
      const controller = new AbortController()
      const { calls, run } = setup(async (_req, call) => {
        if (call === 1) controller.abort()
        return { kind: "ok" }
      })
      expect(await run({ signal: controller.signal })).toEqual({ ok: false, reason: "cancelled" })
      expect(calls).toHaveLength(2)
    })

    it("passes the signal to every chunk request so an abort cuts the one in flight", async () => {
      const controller = new AbortController()
      const { calls, run } = setup([])
      await run({ signal: controller.signal })
      for (const call of calls) expect(call.signal).toBe(controller.signal)
    })

    it("reports a chunk the sender says was cancelled", async () => {
      const { calls, run } = setup([{ kind: "ok" }, { kind: "cancelled" }])
      expect(await run()).toEqual({ ok: false, reason: "cancelled" })
      expect(calls).toHaveLength(2)
    })

    it("sends nothing when it is already aborted", async () => {
      const controller = new AbortController()
      controller.abort()
      const { calls, run } = setup([])
      expect(await run({ signal: controller.signal })).toEqual({ ok: false, reason: "cancelled" })
      expect(calls).toHaveLength(0)
    })

    it("stops waiting to retry when it is cancelled during the backoff", async () => {
      const controller = new AbortController()
      const sleep = vi.fn(async () => controller.abort())
      const { calls, run } = setup(() => ({ kind: "retry" }))
      expect(await run({ signal: controller.signal, sleep })).toEqual({ ok: false, reason: "cancelled" })
      expect(calls).toHaveLength(1)
    })
  })
})
