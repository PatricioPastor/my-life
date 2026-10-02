// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { sharedAudioPath } from "../audio-path"
import type { Memory } from "../memory"
import type { ApprovedMemoryReader } from "../memory-repository"
import { findSharedMemoryWith, type FindSharedMemoryDeps } from "./find-shared-memory"
import { OG_TRANSFORM, cloudinaryUrl } from "../cloudinary-url"
import { signShareToken } from "./share-token"

const ID = "11111111-1111-4111-8111-111111111111"
const SECRET = Buffer.alloc(32, 7).toString("base64url")
const TOKEN = signShareToken(ID, SECRET)

const memory = (over: Partial<Memory> = {}): Memory => ({
  id: ID,
  handle: "ana",
  publicId: "my-life/memories/x",
  caption: "Una tarde",
  happenedOn: new Date("2024-03-12T00:00:00.000Z"),
  width: 800,
  height: 600,
  status: "approved",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  kind: "image",
  format: "jpg",
  bytes: 1,
  takenAt: null,
  dominantColor: "#112233",
  palette: [],
  metadata: {},
  latitude: 40.712812,
  longitude: -74.006009,
  placeName: "Nueva York",
  locationSource: "photo",
  orbColor: "#ff9a3c",
  viewCount: 5,
  audio: null,
  ...over,
})

function setup(over: Partial<FindSharedMemoryDeps> = {}, found: Memory | null = memory()) {
  const repository: ApprovedMemoryReader = { findApproved: vi.fn(async () => found) }
  const full: FindSharedMemoryDeps = {
    secret: SECRET,
    repository: () => repository,
    cloudinary: { cloudName: "demo", apiSecret: "abcd" },
    log: vi.fn(),
    ...over,
  }
  return { full, repository }
}

describe("findSharedMemoryWith", () => {
  it("answers invalid for a token that does not verify, and reads nothing", async () => {
    const { full, repository } = setup()
    expect(await findSharedMemoryWith(full, "garbage")).toEqual({ ok: false, reason: "invalid" })
    expect(await findSharedMemoryWith(full, signShareToken(ID, Buffer.alloc(32, 1).toString("base64url")))).toEqual({
      ok: false,
      reason: "invalid",
    })
    expect(repository.findApproved).not.toHaveBeenCalled()
  })

  it("answers not_found when there is no approved memory (missing, pending and rejected look the same)", async () => {
    const { full, repository } = setup({}, null)
    expect(await findSharedMemoryWith(full, TOKEN)).toEqual({ ok: false, reason: "not_found" })
    expect(repository.findApproved).toHaveBeenCalledWith(ID)
  })

  it("never returns a memory that is not approved, even if the repository hands one over", async () => {
    const { full } = setup({}, memory({ status: "pending" }))
    expect(await findSharedMemoryWith(full, TOKEN)).toEqual({ ok: false, reason: "not_found" })
  })

  it("returns the glass DTO of an approved photo: sizes, coarse place and orb color, no handle", async () => {
    const { full } = setup()
    const result = await findSharedMemoryWith(full, TOKEN)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const m = result.memory
    expect(m).toMatchObject({
      id: ID,
      caption: "Una tarde",
      happenedOn: "2024-03-12",
      status: "approved",
      orbColor: "#ff9a3c",
      place: { lat: 40.71, lng: -74.01, name: "Nueva York" },
      audio: null,
    })
    expect(m.photo?.sizes.length).toBeGreaterThan(0)
    expect(JSON.stringify(m)).not.toContain("ana")
    expect(JSON.stringify(m)).not.toContain("abcd")
  })

  it("shows a guest the view count too (their own open is never recorded)", async () => {
    const result = await findSharedMemoryWith(setup().full, TOKEN)
    expect(result.ok && result.memory.viewCount).toBe(5)
  })

  it("points the audio at the guest route of this token, never at the session route", async () => {
    const audio = { publicId: "my-life/memories/a", format: "webm", bytes: 9, durationMs: 4000 }
    const { full } = setup({}, memory({ publicId: null, width: null, height: null, audio }))
    const result = await findSharedMemoryWith(full, TOKEN)
    expect(result.ok && result.memory.audio).toEqual({ url: sharedAudioPath(TOKEN), durationMs: 4000 })
    expect(result.ok && result.memory.audio?.url).not.toContain(`/${ID}/`)
  })

  it("answers unavailable when Cloudinary or the secret is not configured, or the database fails", async () => {
    expect(await findSharedMemoryWith(setup({ cloudinary: null }).full, TOKEN)).toEqual({ ok: false, reason: "unavailable" })
    expect(await findSharedMemoryWith(setup({ secret: null }).full, TOKEN)).toEqual({ ok: false, reason: "unavailable" })
    const { full, repository } = setup()
    vi.mocked(repository.findApproved).mockRejectedValue(new Error("boom"))
    expect(await findSharedMemoryWith(full, TOKEN)).toEqual({ ok: false, reason: "unavailable" })
  })
})

describe("findSharedMemoryWith: the link preview image", () => {
  it("is a signed 1200x630 jpg crop of the photo", async () => {
    const result = await findSharedMemoryWith(setup().full, TOKEN)
    expect(result.ok && result.ogImageUrl).toBe(cloudinaryUrl("demo", "my-life/memories/x", OG_TRANSFORM, "abcd"))
    expect(OG_TRANSFORM).toContain("w_1200,h_630")
    expect(OG_TRANSFORM).toContain("c_fill")
    expect(OG_TRANSFORM).toContain("f_jpg")
  })

  it("is null for an audio-only memory, whose preview is generated", async () => {
    const audio = { publicId: "my-life/memories/a", format: "webm", bytes: 9, durationMs: 4000 }
    const { full } = setup({}, memory({ publicId: null, width: null, height: null, audio }))
    const result = await findSharedMemoryWith(full, TOKEN)
    expect(result.ok && result.ogImageUrl).toBeNull()
  })
})
