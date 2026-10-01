import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { FULL_TRANSFORM, THUMB_TRANSFORM, cloudinaryUrl } from "./cloudinary-url"
import type { AssetInfo, CloudinaryAssets } from "./cloudinary-assets"
import { createMemoryWith, type CreateMemoryDeps } from "./create-memory"
import type { Memory } from "./memory"
import { DuplicatePublicIdError, type MemoryRepository } from "./memory-repository"
import { MAX_UPLOAD_BYTES } from "./upload-limits"
import type { CreateMemoryInput } from "./upload-view"
import { signUploadTicket } from "./upload-ticket"

const SECRET = Buffer.alloc(32, 7).toString("base64url")
const NOW_MS = Date.UTC(2026, 9, 1, 15, 0, 0)
const NOW = NOW_MS / 1000
const PID = "my-life/memories/3f2b8c1e-6d4a-4f3b-9c1d-0a1b2c3d4e5f"
const ticketFor = (over: Partial<{ h: string; pid: string; exp: number }> = {}, secret = SECRET) =>
  signUploadTicket({ h: "ana", pid: PID, exp: NOW + 600, ...over }, secret)

const asset = (over: Partial<AssetInfo> = {}): AssetInfo => ({
  publicId: PID,
  resourceType: "image",
  type: "authenticated",
  format: "jpg",
  bytes: 1_000_000,
  width: 4032,
  height: 3024,
  ...over,
})

const stored = (over: Partial<Memory> = {}): Memory => ({
  id: "11111111-1111-4111-8111-111111111111",
  handle: "ana",
  publicId: PID,
  caption: "Una tarde",
  happenedOn: new Date("2024-03-12T00:00:00.000Z"),
  width: 4032,
  height: 3024,
  status: "pending",
  createdAt: new Date(NOW_MS),
  kind: "image",
  format: "jpg",
  bytes: 1_000_000,
  takenAt: null,
  dominantColor: null,
  palette: [],
  metadata: {},
  approxLatitude: null,
  approxLongitude: null,
  ...over,
})

function setup(over: Partial<CreateMemoryDeps> = {}, opts: { recent?: number; info?: AssetInfo | null } = {}) {
  const repository: MemoryRepository = {
    listForVisitor: vi.fn(),
    createPending: vi.fn(async () => stored()),
    countRecentBy: vi.fn(async () => opts.recent ?? 0),
  }
  const assets: CloudinaryAssets = {
    describe: vi.fn(async () => (opts.info === undefined ? asset() : opts.info)),
    destroy: vi.fn(async () => {}),
  }
  const full: CreateMemoryDeps = {
    currentVisitor: async () => ({ handle: "ana" }),
    repository: () => repository,
    assets: () => assets,
    cloudinary: { cloudName: "demo", apiSecret: "abcd" },
    ticketSecret: SECRET,
    now: () => NOW_MS,
    log: vi.fn(),
    ...over,
  }
  return { full, repository, assets }
}

const input = (
  over: Partial<{ ticket: string; caption: string; happenedOn: string; shareLocation: unknown }> = {},
) => ({
  ticket: ticketFor(),
  caption: "Una tarde",
  happenedOn: "2024-03-12",
  shareLocation: false,
  ...over,
}) as CreateMemoryInput

// What Cloudinary returns for a phone photo with GPS, serials and an owner name embedded.
const exif = {
  Make: "Apple",
  Model: "iPhone 15",
  DateTimeOriginal: "2024:03:12 14:05:09",
  OffsetTimeOriginal: "+02:00",
  SerialNumber: "SECRET-SERIAL",
  CameraOwnerName: "Ana Perez",
  GPSLatitude: `40 deg 42' 46.08" N`,
  GPSLatitudeRef: "N",
  GPSLongitude: `74 deg 0' 21.6" W`,
  GPSLongitudeRef: "W",
}
const COLORS = [
  ["#112233", 40],
  ["#ffffff", 10],
]
const photo = () => asset({ imageMetadata: exif, colors: COLORS })

describe("createMemoryWith: who and what", () => {
  it("answers no_session without touching Cloudinary or the database", async () => {
    const { full, repository, assets } = setup({ currentVisitor: async () => null })
    expect(await createMemoryWith(full, input())).toEqual({ ok: false, reason: "no_session" })
    expect(assets.describe).not.toHaveBeenCalled()
    expect(repository.createPending).not.toHaveBeenCalled()
  })

  it.each([
    ["a malformed ticket", { ticket: "nope" }],
    ["an expired ticket", { ticket: ticketFor({ exp: NOW - 1 }) }],
    ["a ticket signed with another secret", { ticket: ticketFor({}, Buffer.alloc(32, 1).toString("base64url")) }],
    ["another visitor ticket", { ticket: ticketFor({ h: "eve" }) }],
  ])("refuses %s and touches nothing", async (_name, over) => {
    const { full, repository, assets } = setup()
    expect(await createMemoryWith(full, input(over))).toEqual({ ok: false, reason: "invalid_ticket" })
    expect(assets.describe).not.toHaveBeenCalled()
    expect(assets.destroy).not.toHaveBeenCalled()
    expect(repository.createPending).not.toHaveBeenCalled()
  })

  it("refuses input that is not strings", async () => {
    const { full } = setup()
    const bad = { ticket: 1, caption: null, happenedOn: {} } as never
    expect(await createMemoryWith(full, bad)).toEqual({ ok: false, reason: "invalid_ticket" })
  })

  it.each([
    ["no Cloudinary config", { cloudinary: null }],
    ["no ticket secret", { ticketSecret: null }],
  ])("answers unavailable with %s", async (_name, over) => {
    const { full } = setup(over)
    expect(await createMemoryWith(full, input())).toEqual({ ok: false, reason: "unavailable" })
  })
})

describe("createMemoryWith: validation", () => {
  it("returns the validation errors and destroys the asset, without inserting", async () => {
    const { full, repository, assets } = setup()
    const result = await createMemoryWith(full, input({ caption: "   ", happenedOn: "2999-01-01" }))
    expect(result).toEqual({ ok: false, reason: "invalid", errors: ["caption_empty", "date_in_future"] })
    expect(assets.destroy).toHaveBeenCalledWith(PID)
    expect(repository.createPending).not.toHaveBeenCalled()
  })

  it("treats a malformed date as invalid", async () => {
    const { full } = setup()
    const result = await createMemoryWith(full, input({ happenedOn: "12/03/2024" }))
    expect(result).toEqual({ ok: false, reason: "invalid", errors: ["date_invalid"] })
  })

  it("accepts today anywhere on Earth (a visitor ahead of UTC picks tomorrow's UTC date)", async () => {
    const { full } = setup()
    expect((await createMemoryWith(full, input({ happenedOn: "2026-10-02" }))).ok).toBe(true)
    const tooFar = await createMemoryWith(setup().full, input({ happenedOn: "2026-10-03" }))
    expect(tooFar).toMatchObject({ ok: false, reason: "invalid" })
  })
})

describe("createMemoryWith: asset verification", () => {
  it.each<[string, AssetInfo, string]>([
    ["is not an image", asset({ resourceType: "video" }), "asset_type"],
    ["is a public upload, whose original would carry its EXIF", asset({ type: "upload" }), "asset_type"],
    ["has a format we do not allow", asset({ format: "gif" }), "asset_type"],
    ["is over 10 MB", asset({ bytes: MAX_UPLOAD_BYTES + 1 }), "asset_too_large"],
    ["has no dimensions", asset({ width: 0 }), "asset_type"],
  ])("destroys the asset and refuses when it %s", async (_name, info, reason) => {
    const { full, repository, assets } = setup({}, { info })
    expect(await createMemoryWith(full, input())).toEqual({ ok: false, reason })
    expect(assets.destroy).toHaveBeenCalledWith(PID)
    expect(repository.createPending).not.toHaveBeenCalled()
  })

  it("answers asset_missing when Cloudinary has nothing, with nothing to destroy", async () => {
    const { full, repository, assets } = setup({}, { info: null })
    expect(await createMemoryWith(full, input())).toEqual({ ok: false, reason: "asset_missing" })
    expect(assets.destroy).not.toHaveBeenCalled()
    expect(repository.createPending).not.toHaveBeenCalled()
  })

  it("answers unavailable, trying to clean up, when Cloudinary cannot answer", async () => {
    const { full, assets } = setup()
    vi.mocked(assets.describe).mockRejectedValueOnce(new Error("503"))
    expect(await createMemoryWith(full, input())).toEqual({ ok: false, reason: "unavailable" })
    expect(assets.destroy).toHaveBeenCalledWith(PID)
  })

  it("still answers with the original failure when the cleanup fails too", async () => {
    const { full, assets } = setup({}, { info: asset({ format: "gif" }) })
    vi.mocked(assets.destroy).mockRejectedValueOnce(new Error("503"))
    expect(await createMemoryWith(full, input())).toEqual({ ok: false, reason: "asset_type" })
  })
})

describe("createMemoryWith: rate limit and insert", () => {
  it("re-checks the rate limit, destroys the asset and does not insert", async () => {
    const { full, repository, assets } = setup({}, { recent: 5 })
    expect(await createMemoryWith(full, input())).toEqual({ ok: false, reason: "rate_limited" })
    expect(repository.countRecentBy).toHaveBeenCalledWith("ana", new Date(NOW_MS - 24 * 60 * 60 * 1000))
    expect(assets.destroy).toHaveBeenCalledWith(PID)
    expect(repository.createPending).not.toHaveBeenCalled()
  })

  it("inserts under the session handle with Cloudinary dimensions, never the client's", async () => {
    const { full, repository, assets } = setup({}, { info: asset({ width: 640, height: 480 }) })
    const result = await createMemoryWith(full, input({ caption: "  Una tarde  " }))
    expect(repository.createPending).toHaveBeenCalledWith("ana", {
      publicId: PID,
      caption: "Una tarde",
      happenedOn: new Date("2024-03-12T00:00:00.000Z"),
      width: 640,
      height: 480,
      kind: "image",
      format: "jpg",
      bytes: 1_000_000,
      takenAt: null,
      dominantColor: null,
      palette: [],
      metadata: {},
      approxLatitude: null,
      approxLongitude: null,
    })
    expect(assets.destroy).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })

  it("returns the new pending memory as a DTO with no handle or public id", async () => {
    const { full } = setup()
    const result = await createMemoryWith(full, input())
    expect(result).toEqual({
      ok: true,
      memory: {
        id: "11111111-1111-4111-8111-111111111111",
        caption: "Una tarde",
        happenedOn: "2024-03-12",
        status: "pending",
        width: 4032,
        height: 3024,
        kind: "image",
        takenAt: null,
        dominantColor: null,
        thumbUrl: cloudinaryUrl("demo", PID, THUMB_TRANSFORM, "abcd"),
        fullUrl: cloudinaryUrl("demo", PID, FULL_TRANSFORM, "abcd"),
      },
    })
    const json = JSON.stringify(result)
    expect(json).not.toContain('"handle"')
    expect(json).not.toContain("publicId")
  })

  it("answers with kind, takenAt and dominantColor, but never the location, palette or metadata", async () => {
    const { full, repository } = setup({}, { info: photo() })
    vi.mocked(repository.createPending).mockResolvedValueOnce(
      stored({
        takenAt: new Date("2024-03-12T12:05:09.000Z"),
        dominantColor: "#112233",
        palette: [{ color: "#112233", share: 40 }],
        metadata: { Make: "Apple" },
        approxLatitude: 40.71,
        approxLongitude: -74.01,
      }),
    )
    const result = await createMemoryWith(full, input({ shareLocation: true }))
    if (!result.ok) throw new Error("expected ok")
    expect(result.memory).toMatchObject({
      kind: "image",
      takenAt: "2024-03-12T12:05:09.000Z",
      dominantColor: "#112233",
    })
    const json = JSON.stringify(result)
    expect(json).not.toMatch(/latitude|longitude|approx|palette|metadata|Apple|40\.71|74\.01|GPS/i)
  })

  it("answers duplicate, and keeps the asset, when the public id is already stored", async () => {
    const { full, repository, assets } = setup()
    vi.mocked(repository.createPending).mockRejectedValueOnce(new DuplicatePublicIdError())
    expect(await createMemoryWith(full, input())).toEqual({ ok: false, reason: "duplicate" })
    // The asset belongs to the memory that already exists: destroying it would break that one.
    expect(assets.destroy).not.toHaveBeenCalled()
  })

  it("answers unavailable, with one handle-free log line, when the insert fails", async () => {
    const log = vi.fn()
    const { full, repository } = setup({ log })
    vi.mocked(repository.createPending).mockRejectedValueOnce(new Error("ana: connection refused"))
    expect(await createMemoryWith(full, input())).toEqual({ ok: false, reason: "unavailable" })
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0][0])).not.toContain("ana")
  })
})

describe("createMemoryWith: photo details", () => {
  it("persists format, bytes, taken date, colors and a whitelisted metadata, never GPS, serials or owner names", async () => {
    const { full, repository } = setup({}, { info: photo() })
    await createMemoryWith(full, input())
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({
      kind: "image",
      format: "jpg",
      bytes: 1_000_000,
      takenAt: new Date("2024-03-12T12:05:09.000Z"),
      dominantColor: "#112233",
      palette: [
        { color: "#112233", share: 40 },
        { color: "#ffffff", share: 10 },
      ],
      metadata: { Make: "Apple", Model: "iPhone 15", DateTimeOriginal: "2024:03:12 14:05:09", OffsetTimeOriginal: "+02:00" },
    })
    expect(JSON.stringify(saved)).not.toMatch(/GPS|SECRET-SERIAL|Ana Perez|Serial|Owner/)
  })

  it("stores only an approximate location (2 decimals) when the visitor opted in", async () => {
    const { full, repository } = setup({}, { info: photo() })
    await createMemoryWith(full, input({ shareLocation: true }))
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({ approxLatitude: 40.71, approxLongitude: -74.01 })
    // The exact coordinates (40.7128 / -74.006) appear nowhere in what is stored.
    expect(JSON.stringify(saved)).not.toMatch(/40\.712|74\.006|42' 46|21\.6/)
  })

  it.each([
    ["not opted in", false],
    ["a value that is not the boolean true", "true"],
    ["a truthy number", 1],
    ["missing", undefined],
  ])("stores no location when the visitor is %s, even though the photo has GPS", async (_name, shareLocation) => {
    const { full, repository } = setup({}, { info: photo() })
    await createMemoryWith(full, input({ shareLocation }))
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({ approxLatitude: null, approxLongitude: null })
  })

  it("stores no location when the visitor opted in but the photo has no valid GPS", async () => {
    const { full, repository } = setup(
      {},
      { info: asset({ imageMetadata: { Make: "Apple", GPSLatitude: "95" }, colors: COLORS }) },
    )
    await createMemoryWith(full, input({ shareLocation: true }))
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({ approxLatitude: null, approxLongitude: null })
  })

  it("never logs coordinates or metadata, even when saving fails", async () => {
    const log = vi.fn()
    const { full, repository } = setup({ log }, { info: photo() })
    vi.mocked(repository.createPending).mockRejectedValueOnce(new Error("40.7128,-74.006 boom"))
    await createMemoryWith(full, input({ shareLocation: true }))
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/40\.7|74\.0|GPS|Apple/)
  })
})
