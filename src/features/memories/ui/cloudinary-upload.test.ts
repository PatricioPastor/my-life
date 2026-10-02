import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { uploadToCloudinary } from "./cloudinary-upload"

class FakeXhr {
  static last: FakeXhr | null = null
  static all: FakeXhr[] = []
  headers: Record<string, string> = {}
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  ontimeout: (() => void) | null = null
  status = 0
  method = ""
  url = ""
  body: FormData | null = null
  aborted = false
  constructor() {
    FakeXhr.last = this
    FakeXhr.all.push(this)
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  send(body: FormData) {
    this.body = body
  }
  abort() {
    this.aborted = true
    this.onabort?.()
  }
}

beforeEach(() => {
  FakeXhr.last = null
  FakeXhr.all = []
  vi.stubGlobal("XMLHttpRequest", FakeXhr)
})
afterEach(() => vi.unstubAllGlobals())

const grant = {
  cloudName: "demo",
  fields: { api_key: "k", timestamp: "1", signature: "s", public_id: "my-life/memories/x", allowed_formats: "jpg", overwrite: "false" },
}
const file = new File(["x"], "foto.jpg", { type: "image/jpeg" })

describe("uploadToCloudinary", () => {
  it("posts the signed fields and the file straight to Cloudinary's image upload endpoint", () => {
    void uploadToCloudinary({ file, ...grant, resource: "image", onProgress: () => {} })
    const xhr = FakeXhr.last!
    expect(xhr.method).toBe("POST")
    expect(xhr.url).toBe("https://api.cloudinary.com/v1_1/demo/image/upload")
    for (const [key, value] of Object.entries(grant.fields)) expect(xhr.body!.get(key)).toBe(value)
    expect(xhr.body!.get("file")).toBeInstanceOf(File)
    // The ticket is for our server only.
    expect(xhr.body!.has("ticket")).toBe(false)
  })

  it("posts an audio to the video upload endpoint, where Cloudinary keeps audio", () => {
    const audio = new File(["x"], "nota.webm", { type: "audio/webm" })
    void uploadToCloudinary({ file: audio, ...grant, resource: "video", onProgress: () => {} })
    const xhr = FakeXhr.last!
    expect(xhr.url).toBe("https://api.cloudinary.com/v1_1/demo/video/upload")
    expect(xhr.body!.get("file")).toBeInstanceOf(File)
    for (const [key, value] of Object.entries(grant.fields)) expect(xhr.body!.get(key)).toBe(value)
  })

  it("sends a recorded blob as a named file, so Cloudinary has a name to read", () => {
    const blob = new Blob(["x"], { type: "audio/webm" })
    void uploadToCloudinary({ file: blob, name: "voz.webm", ...grant, resource: "video", onProgress: () => {} })
    const sent = FakeXhr.last!.body!.get("file") as File
    expect(sent.name).toBe("voz.webm")
  })

  it("reports progress as a whole percentage and ignores unknown totals", () => {
    const onProgress = vi.fn()
    void uploadToCloudinary({ file, ...grant, resource: "image", onProgress })
    const xhr = FakeXhr.last!
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 42, total: 100 })
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 3 })
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 5, total: 0 })
    expect(onProgress.mock.calls).toEqual([[42], [33]])
  })

  it("resolves ok on a 2xx answer", async () => {
    const promise = uploadToCloudinary({ file, ...grant, resource: "image", onProgress: () => {} })
    FakeXhr.last!.status = 200
    FakeXhr.last!.onload?.()
    expect(await promise).toEqual({ ok: true })
  })

  it("resolves failed on an error status, a network error or a timeout", async () => {
    const a = uploadToCloudinary({ file, ...grant, resource: "image", onProgress: () => {} })
    FakeXhr.last!.status = 400
    FakeXhr.last!.onload?.()
    expect(await a).toEqual({ ok: false, reason: "failed" })

    const b = uploadToCloudinary({ file, ...grant, resource: "image", onProgress: () => {} })
    FakeXhr.last!.onerror?.()
    expect(await b).toEqual({ ok: false, reason: "failed" })

    const c = uploadToCloudinary({ file, ...grant, resource: "image", onProgress: () => {} })
    FakeXhr.last!.ontimeout?.()
    expect(await c).toEqual({ ok: false, reason: "failed" })
  })

  it("cancels: aborting the signal aborts the request and resolves cancelled", async () => {
    const controller = new AbortController()
    const promise = uploadToCloudinary({ file, ...grant, resource: "image", onProgress: () => {}, signal: controller.signal })
    controller.abort()
    expect(FakeXhr.last!.aborted).toBe(true)
    expect(await promise).toEqual({ ok: false, reason: "cancelled" })
  })

  it("does not send anything when the signal is already aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    expect(await uploadToCloudinary({ file, ...grant, resource: "image", onProgress: () => {}, signal: controller.signal })).toEqual({
      ok: false,
      reason: "cancelled",
    })
    expect(FakeXhr.last).toBeNull()
  })
})

describe("uploadToCloudinary: a long audio, in chunks", () => {
  const BIG = 20_000_001 // four chunks of the default 6 MB
  const big = () => new File([new Uint8Array(BIG)], "larga.mp3", { type: "audio/mpeg" })
  const audioGrant = { ...grant, fields: { ...grant.fields, eager: "f_mp3", eager_async: "true" } }
  const sent = (n: number) => vi.waitFor(() => expect(FakeXhr.all).toHaveLength(n))
  const answer = (xhr: FakeXhr, status: number) => {
    xhr.status = status
    xhr.onload?.()
  }

  it("keeps a file of up to 20 MB as one request, without chunk headers", () => {
    const small = new File([new Uint8Array(20_000_000)], "a.mp3", { type: "audio/mpeg" })
    void uploadToCloudinary({ file: small, ...audioGrant, resource: "video", onProgress: () => {} })
    expect(FakeXhr.all).toHaveLength(1)
    expect(FakeXhr.last!.headers).toEqual({})
    expect(FakeXhr.last!.body!.get("file")).toBeInstanceOf(File)
  })

  it("sends a bigger file chunk by chunk to the same endpoint, with the id and range headers and the same signed fields", async () => {
    const promise = uploadToCloudinary({ file: big(), ...audioGrant, resource: "video", onProgress: () => {} })
    await sent(1)
    const first = FakeXhr.all[0]
    expect(first.method).toBe("POST")
    expect(first.url).toBe("https://api.cloudinary.com/v1_1/demo/video/upload")
    expect(first.headers["Content-Range"]).toBe("bytes 0-5999999/20000001")
    expect(first.headers["X-Unique-Upload-Id"]).toMatch(/\S{8,}/)
    for (const [key, value] of Object.entries(audioGrant.fields)) expect(first.body!.get(key)).toBe(value)
    expect((first.body!.get("file") as Blob).size).toBe(6_000_000)

    answer(first, 200)
    await sent(2)
    answer(FakeXhr.all[1], 200)
    await sent(3)
    answer(FakeXhr.all[2], 200)
    await sent(4)
    const last = FakeXhr.all[3]
    expect(last.headers["Content-Range"]).toBe("bytes 18000000-20000000/20000001")
    expect(new Set(FakeXhr.all.map((x) => x.headers["X-Unique-Upload-Id"])).size).toBe(1)
    answer(last, 200)
    expect(await promise).toEqual({ ok: true })
  })

  it("aggregates the progress of the chunks into one percentage", async () => {
    const onProgress = vi.fn()
    void uploadToCloudinary({ file: big(), ...audioGrant, resource: "video", onProgress })
    await sent(1)
    FakeXhr.all[0].upload.onprogress?.({ lengthComputable: true, loaded: 3_000_000, total: 6_000_100 })
    expect(onProgress).toHaveBeenLastCalledWith(15)
    answer(FakeXhr.all[0], 200)
    await sent(2)
    FakeXhr.all[1].upload.onprogress?.({ lengthComputable: true, loaded: 3_000_000, total: 6_000_100 })
    expect(onProgress).toHaveBeenLastCalledWith(45)
  })

  it("retries a chunk after a server error or a dropped connection, with the same range", async () => {
    vi.useFakeTimers()
    try {
      const promise = uploadToCloudinary({ file: big(), ...audioGrant, resource: "video", onProgress: () => {} })
      await vi.advanceTimersByTimeAsync(0)
      answer(FakeXhr.all[0], 503)
      await vi.advanceTimersByTimeAsync(1000)
      expect(FakeXhr.all).toHaveLength(2)
      expect(FakeXhr.all[1].headers["Content-Range"]).toBe(FakeXhr.all[0].headers["Content-Range"])
      FakeXhr.all[1].onerror?.()
      await vi.advanceTimersByTimeAsync(2000)
      expect(FakeXhr.all).toHaveLength(3)
      expect(FakeXhr.all[2].headers["Content-Range"]).toBe(FakeXhr.all[0].headers["Content-Range"])
      FakeXhr.all[2].ontimeout?.()
      await vi.advanceTimersByTimeAsync(4000)
      expect(FakeXhr.all).toHaveLength(4)
      answer(FakeXhr.all[3], 429)
      expect(await promise).toEqual({ ok: false, reason: "failed" })
      expect(FakeXhr.all).toHaveLength(4)
    } finally {
      vi.useRealTimers()
    }
  })

  it("fails at once on an answer a retry cannot fix (a bad signature, a file too big)", async () => {
    const promise = uploadToCloudinary({ file: big(), ...audioGrant, resource: "video", onProgress: () => {} })
    await sent(1)
    answer(FakeXhr.all[0], 401)
    expect(await promise).toEqual({ ok: false, reason: "failed" })
    expect(FakeXhr.all).toHaveLength(1)
  })

  it("cancels the chunk in flight and sends no more when the signal aborts", async () => {
    const controller = new AbortController()
    const promise = uploadToCloudinary({ file: big(), ...audioGrant, resource: "video", onProgress: () => {}, signal: controller.signal })
    await sent(1)
    controller.abort()
    expect(FakeXhr.all[0].aborted).toBe(true)
    expect(await promise).toEqual({ ok: false, reason: "cancelled" })
    expect(FakeXhr.all).toHaveLength(1)
  })
})
