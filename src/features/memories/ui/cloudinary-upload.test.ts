import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { uploadToCloudinary } from "./cloudinary-upload"

class FakeXhr {
  static last: FakeXhr | null = null
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
