// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const find = vi.fn()
vi.mock("@/features/memories/share/shared-memory", () => ({ findSharedMemory: (token: string) => find(token) }))

import { GET, dynamic } from "./route"

const context = (token = "tok.en") => ({ params: Promise.resolve({ token }) })
const request = () => new Request("http://localhost/m/tok.en/og")
const audioOnly = {
  ok: true,
  memory: { caption: "Mamá cantando", orbColor: "#ff9a3c", thumbUrl: null, audio: { url: "/x", durationMs: 1 } },
  ogImageUrl: null,
}

beforeEach(() => find.mockReset())

describe("GET /m/[token]/og", () => {
  it("is dynamic", () => {
    expect(dynamic).toBe("force-dynamic")
  })

  it("draws a 1200x630 png for an audio-only memory", async () => {
    find.mockResolvedValue(audioOnly)
    const res = await GET(request(), context())
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
    const png = new Uint8Array(await res.arrayBuffer())
    const view = new DataView(png.buffer)
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630])
  }, 30_000)

  it.each([
    ["an invalid link", { ok: false, reason: "invalid" }],
    ["a memory that is not approved", { ok: false, reason: "not_found" }],
    ["a memory with a photo, whose preview is the photo", { ok: true, memory: { caption: "x", orbColor: "#fff", thumbUrl: "t" }, ogImageUrl: "https://x/y.jpg" }],
  ])("answers 404 for %s", async (_name, result) => {
    find.mockResolvedValue(result)
    expect((await GET(request(), context())).status).toBe(404)
  })
})
