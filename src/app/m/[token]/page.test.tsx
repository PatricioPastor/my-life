// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

class Redirect extends Error {
  constructor(readonly to: string) {
    super("NEXT_REDIRECT")
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string): never => {
    throw new Redirect(to)
  },
}))

const find = vi.fn()
vi.mock("@/features/memories/share/shared-memory", () => ({ findSharedMemory: (token: string) => find(token) }))
vi.mock("@/features/memories/ui/shared-memory", () => ({ SharedMemory: () => null }))
vi.mock("@/shared/site/site-url", () => ({ resolveSiteUrl: () => "https://example.com" }))

import Page, { dynamic, generateMetadata } from "./page"
import type { MemoryView } from "@/features/memories"

const TOKEN = "tok.en"
const params = (token = TOKEN) => ({ params: Promise.resolve({ token }) })

const memory = (over: Partial<MemoryView> = {}): MemoryView => ({
  id: "11111111-1111-4111-8111-111111111111",
  caption: "Una tarde de lluvia",
  happenedOn: "2024-03-12",
  status: "approved",
  width: 800,
  height: 600,
  kind: "image",
  takenAt: null,
  dominantColor: null,
  place: null,
  orbColor: "#8ab4ff",
  thumbUrl: "https://res.cloudinary.com/demo/t",
  fullUrl: "https://res.cloudinary.com/demo/f",
  audio: null,
  ...over,
})
const found = (over: Partial<MemoryView> = {}, ogImageUrl: string | null = "https://res.cloudinary.com/demo/og.jpg") => ({
  ok: true as const,
  memory: memory(over),
  ogImageUrl,
})

beforeEach(() => find.mockReset())

describe("/m/[token] page", () => {
  it("is dynamic: it reads the database at request time, and / stays static", () => {
    expect(dynamic).toBe("force-dynamic")
  })

  it.each([
    ["invalid", { ok: false, reason: "invalid" }],
    ["missing or not approved", { ok: false, reason: "not_found" }],
    ["unavailable", { ok: false, reason: "unavailable" }],
  ])("redirects to the start for a link that is %s", async (_name, result) => {
    find.mockResolvedValue(result)
    await expect(Page(params())).rejects.toMatchObject({ to: "/" })
  })

  it("renders the guest view of that memory, with the absolute link to share it again", async () => {
    find.mockResolvedValue(found())
    const element = (await Page(params())) as unknown as { props: { memory: MemoryView; shareUrl: string } }
    expect(element.props.memory.caption).toBe("Una tarde de lluvia")
    expect(element.props.shareUrl).toBe("https://example.com/m/tok.en")
    expect(find).toHaveBeenCalledWith(TOKEN)
  })
})

describe("/m/[token] metadata", () => {
  it("titles the page with the caption and describes it with the date and a neutral line", async () => {
    find.mockResolvedValue(found())
    const meta = await generateMetadata(params())
    expect(meta.title).toBe("Una tarde de lluvia")
    expect(meta.description).toBe("12 de marzo de 2024 · Un recuerdo de patriciopastor")
    expect(meta.openGraph).toMatchObject({ title: "Una tarde de lluvia", description: meta.description, type: "website" })
  })

  it("is noindex and nofollow, so a shared memory never gets indexed", async () => {
    find.mockResolvedValue(found())
    expect((await generateMetadata(params())).robots).toEqual({ index: false, follow: false })
  })

  it("is noindex even for a link that goes nowhere, and says nothing about any memory", async () => {
    find.mockResolvedValue({ ok: false, reason: "not_found" })
    const meta = await generateMetadata(params())
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(meta.title).toBeUndefined()
    expect(meta.openGraph).toBeUndefined()
  })

  it("uses the signed 1200x630 crop of the photo as the preview image", async () => {
    find.mockResolvedValue(found())
    const meta = await generateMetadata(params())
    expect(meta.openGraph?.images).toEqual([
      { url: "https://res.cloudinary.com/demo/og.jpg", width: 1200, height: 630, alt: "Una tarde de lluvia" },
    ])
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", images: ["https://res.cloudinary.com/demo/og.jpg"] })
  })

  it("uses the generated card for an audio-only memory", async () => {
    find.mockResolvedValue(found({ width: null, height: null, thumbUrl: null, fullUrl: null, audio: { url: "/x", durationMs: 1000 } }, null))
    const meta = await generateMetadata(params())
    const url = "https://example.com/m/tok.en/og"
    expect(meta.openGraph?.images).toEqual([{ url, width: 1200, height: 630, alt: "Una tarde de lluvia" }])
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", images: [url] })
  })
})
