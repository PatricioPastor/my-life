import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { FULL_TRANSFORM, THUMB_TRANSFORM, cloudinaryUrl, squareTransform } from "./cloudinary-url"
import type { AssetInfo, AudioInfo, CloudinaryAssets } from "./cloudinary-assets"
import { createMemoryWith, type CreateMemoryDeps } from "./create-memory"
import type { Memory } from "./memory"
import { DuplicatePublicIdError, type MemoryRepository } from "./memory-repository"
import { MAX_AUDIO_BYTES, MAX_AUDIO_MS, MAX_UPLOAD_BYTES } from "./upload-limits"
import type { CreateMemoryInput } from "./upload-view"
import { signUploadTicket } from "./upload-ticket"
import { DEFAULT_ORB_COLOR, glowColor, isGlowColor } from "./orb-color"
import { orbHueFor } from "./orb-hues"
import type { ReverseGeocoder } from "./place/reverse-geocoder"

const SECRET = Buffer.alloc(32, 7).toString("base64url")
const NOW_MS = Date.UTC(2026, 9, 1, 15, 0, 0)
const NOW = NOW_MS / 1000
const PID = "my-life/memories/3f2b8c1e-6d4a-4f3b-9c1d-0a1b2c3d4e5f"
const AID = "my-life/memories/audio-9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"
const ticketFor = (over: Partial<{ h: string; pid: string; aid: string; exp: number }> = {}, secret = SECRET) =>
  signUploadTicket({ h: "ana", pid: PID, exp: NOW + 600, ...over }, secret)
const voiceTicket = (over: Partial<{ pid: string | undefined; aid: string }> = {}) => {
  const { pid, aid } = { pid: undefined, aid: AID, ...over }
  return signUploadTicket({ h: "ana", ...(pid ? { pid } : {}), aid, exp: NOW + 600 }, SECRET)
}

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

const voice = (over: Partial<AudioInfo> = {}): AudioInfo => ({
  publicId: AID,
  resourceType: "video",
  type: "authenticated",
  format: "webm",
  bytes: 200_000,
  durationSeconds: 42.5,
  isAudio: true,
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
  latitude: null,
  longitude: null,
  placeName: null,
  placeAddress: null,
  locationSource: null,
  orbColor: null,
  viewCount: 0,
  relatedMemoryId: null,
  audio: null,
  ...over,
})

function setup(
  over: Partial<CreateMemoryDeps> = {},
  opts: { recent?: number; info?: AssetInfo | null; audio?: AudioInfo | null } = {},
) {
  const reverse = vi.fn<ReverseGeocoder["reverse"]>(async () => ({
    label: "Palermo, Buenos Aires",
    address: "Honduras 4000, Buenos Aires",
  }))
  const follow = vi.fn<CreateMemoryDeps["follow"]>(async () => ({ ok: false, reason: "network" }))
  const repository: MemoryRepository = {
    listForVisitor: vi.fn(),
    findForVisitor: vi.fn(),
    createPending: vi.fn(async () => stored()),
    countRecentBy: vi.fn(async () => opts.recent ?? 0),
  }
  const assets: CloudinaryAssets = {
    describe: vi.fn(async () => (opts.info === undefined ? asset() : opts.info)),
    destroy: vi.fn(async () => {}),
    describeAudio: vi.fn(async () => (opts.audio === undefined ? voice() : opts.audio)),
    destroyAudio: vi.fn(async () => {}),
  }
  const full: CreateMemoryDeps = {
    currentVisitor: async () => ({ handle: "ana" }),
    repository: () => repository,
    assets: () => assets,
    cloudinary: { cloudName: "demo", apiSecret: "abcd" },
    ticketSecret: SECRET,
    now: () => NOW_MS,
    geocoder: () => ({ reverse }),
    follow,
    log: vi.fn(),
    ...over,
  }
  return { full, repository, assets, reverse, follow }
}

const input = (
  over: Partial<{
    ticket: string
    caption: string
    happenedOn: string
    shareLocation: unknown
    mapsUrl: unknown
    orbColor: unknown
    relatedMemoryId: unknown
    samePlace: unknown
  }> = {},
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
      latitude: null,
      longitude: null,
      placeName: null,
      placeAddress: null,
      locationSource: null,
      orbColor: DEFAULT_ORB_COLOR,
      relatedMemoryId: null,
      audio: null,
    })
    expect(assets.destroy).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })

  it("returns the new pending memory as a DTO with no handle or public id", async () => {
    const { full } = setup()
    const result = await createMemoryWith(full, input())
    expect(result).toEqual({
      ok: true,
      locationSaved: false,
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
        place: null,
        relatedId: null,
        orbColor: orbHueFor("11111111-1111-4111-8111-111111111111"),
        // A memory nobody has opened yet.
        viewCount: 0,
        thumbUrl: cloudinaryUrl("demo", PID, THUMB_TRANSFORM, "abcd"),
        fullUrl: cloudinaryUrl("demo", PID, FULL_TRANSFORM, "abcd"),
        photo: {
          sizes: [96, 192, 384, 768, 1600].map((width) => ({ width, url: cloudinaryUrl("demo", PID, squareTransform(width), "abcd") })),
        },
        audio: null,
      },
    })
    const json = JSON.stringify(result)
    expect(json).not.toContain('"handle"')
    expect(json).not.toContain("publicId")
  })

  it("answers with kind, takenAt, dominantColor and a coarse place, but never the exact location, palette or metadata", async () => {
    const { full, repository } = setup({}, { info: photo() })
    vi.mocked(repository.createPending).mockResolvedValueOnce(
      stored({
        takenAt: new Date("2024-03-12T12:05:09.000Z"),
        dominantColor: "#112233",
        palette: [{ color: "#112233", share: 40 }],
        metadata: { Make: "Apple" },
        latitude: 40.712812,
        longitude: -74.006009,
        placeName: "Palermo, Buenos Aires",
      }),
    )
    const result = await createMemoryWith(full, input({ shareLocation: true }))
    if (!result.ok) throw new Error("expected ok")
    expect(result.memory).toMatchObject({
      kind: "image",
      takenAt: "2024-03-12T12:05:09.000Z",
      dominantColor: "#112233",
      place: { lat: 40.71, lng: -74.01, name: "Palermo, Buenos Aires" },
    })
    const json = JSON.stringify(result)
    expect(json).not.toMatch(/latitude|longitude|approx|palette|metadata|Apple|40\.7128|74\.006|GPS/i)
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

  it("stores the exact location from the photo's EXIF when the visitor opted in", async () => {
    const { full, repository } = setup({}, { info: photo() })
    await createMemoryWith(full, input({ shareLocation: true }))
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({ latitude: 40.7128, longitude: -74.006 })
    // The raw EXIF strings are never stored, only the decoded position.
    expect(JSON.stringify(saved)).not.toMatch(/42' 46|21\.6|GPS/)
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
    expect(saved).toMatchObject({ latitude: null, longitude: null })
  })

  it("stores no location when the visitor opted in but the photo has no valid GPS", async () => {
    const { full, repository } = setup(
      {},
      { info: asset({ imageMetadata: { Make: "Apple", GPSLatitude: "95" }, colors: COLORS }) },
    )
    await createMemoryWith(full, input({ shareLocation: true }))
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({ latitude: null, longitude: null })
  })

  it("never logs coordinates or metadata, even when saving fails", async () => {
    const log = vi.fn()
    const { full, repository } = setup({ log }, { info: photo() })
    vi.mocked(repository.createPending).mockRejectedValueOnce(new Error("40.7128,-74.006 boom"))
    await createMemoryWith(full, input({ shareLocation: true }))
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/40\.7|74\.0|GPS|Apple/)
  })
})

describe("createMemoryWith: the place", () => {
  it("stores the photo position, source photo, geocoded name and street address when the visitor opted in", async () => {
    const { full, repository, reverse } = setup({}, { info: photo() })
    const result = await createMemoryWith(full, input({ shareLocation: true }))
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({
      latitude: 40.7128,
      longitude: -74.006,
      locationSource: "photo",
      placeName: "Palermo, Buenos Aires",
      placeAddress: "Honduras 4000, Buenos Aires",
    })
    // The address needs the exact position: that is what the geocoder is asked about.
    expect(reverse).toHaveBeenCalledWith(40.7128, -74.006)
    expect(result).toMatchObject({ ok: true, locationSaved: true })
  })

  it("never geocodes without the visitor's consent", async () => {
    const { full, reverse } = setup({}, { info: photo() })
    await createMemoryWith(full, input({ shareLocation: false }))
    expect(reverse).not.toHaveBeenCalled()
  })

  it("does not geocode, and stores no place, without consent", async () => {
    const { full, repository, reverse } = setup({}, { info: photo() })
    const result = await createMemoryWith(full, input({ shareLocation: false }))
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({ latitude: null, longitude: null, locationSource: null, placeName: null })
    expect(reverse).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: true, locationSaved: false })
  })

  it("saves the memory with the location and no name when geocoding fails", async () => {
    const { full, repository, reverse } = setup({}, { info: photo() })
    reverse.mockRejectedValueOnce(new Error("down"))
    const result = await createMemoryWith(full, input({ shareLocation: true }))
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({ latitude: 40.7128, locationSource: "photo", placeName: null })
    expect(result).toMatchObject({ ok: true, locationSaved: true })
  })

  it("saves with no location, and says so, when the photo has no GPS", async () => {
    const { full, repository } = setup({}, { info: asset({ imageMetadata: { Make: "Apple" }, colors: COLORS }) })
    const result = await createMemoryWith(full, input({ shareLocation: true }))
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({ latitude: null, locationSource: null, placeName: null })
    expect(result).toMatchObject({ ok: true, locationSaved: false })
  })

  it("returns only a coarse place in the DTO: rounded coordinates and the name, never the source or exact position", async () => {
    const { full, repository } = setup({}, { info: photo() })
    vi.mocked(repository.createPending).mockResolvedValueOnce(
      stored({ latitude: 40.712812, longitude: -74.006009, placeName: "Palermo, Buenos Aires", locationSource: "photo" }),
    )
    const result = await createMemoryWith(full, input({ shareLocation: true }))
    if (!result.ok) throw new Error("expected ok")
    expect(result.memory.place).toEqual({ lat: 40.71, lng: -74.01, name: "Palermo, Buenos Aires", address: null })
    // The source never leaves as a value (`"photo"`); the DTO's own `photo` key (its sizes) is not a leak.
    expect(JSON.stringify(result.memory)).not.toMatch(/locationSource|:"photo"|40\.7128|74\.006/)
  })

  it("returns a null place in the DTO when no location was stored", async () => {
    const { full } = setup({}, { info: photo() })
    const result = await createMemoryWith(full, input({ shareLocation: false }))
    if (!result.ok) throw new Error("expected ok")
    expect(result.memory.place).toBeNull()
  })
})

describe("createMemoryWith: a Google Maps link", () => {
  const PLACE_LINK = "https://www.google.com/maps/place/Plaza+Italia/@-34.5810,-58.4208,17z"
  const NAMELESS = "https://www.google.com/maps/@40.712812,-74.006009,12z"

  it("stores the link position, source link and the name from the URL, ignoring the photo GPS", async () => {
    const { full, repository, reverse } = setup({}, { info: photo() })
    const result = await createMemoryWith(full, input({ shareLocation: true, mapsUrl: PLACE_LINK }))
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({
      latitude: -34.581,
      longitude: -58.4208,
      locationSource: "link",
      placeName: "Plaza Italia",
      placeAddress: "Honduras 4000, Buenos Aires",
    })
    // The URL's name stays the name; the address is geocoded from the exact pin.
    expect(reverse).toHaveBeenCalledWith(-34.581, -58.4208)
    expect(result).toMatchObject({ ok: true, locationSaved: true })
  })

  it("stores the exact link position and names a nameless link by reverse geocoding its exact position", async () => {
    const { full, repository, reverse } = setup()
    await createMemoryWith(full, input({ shareLocation: true, mapsUrl: NAMELESS }))
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({
      latitude: 40.712812,
      longitude: -74.006009,
      locationSource: "link",
      placeName: "Palermo, Buenos Aires",
      placeAddress: "Honduras 4000, Buenos Aires",
    })
    expect(reverse).toHaveBeenCalledWith(40.712812, -74.006009)
  })

  it("resolves a short link on the server", async () => {
    const { full, repository, follow } = setup()
    follow.mockResolvedValueOnce({ ok: true, url: PLACE_LINK })
    await createMemoryWith(full, input({ shareLocation: true, mapsUrl: "https://maps.app.goo.gl/AbCd" }))
    expect(follow).toHaveBeenCalledWith("https://maps.app.goo.gl/AbCd")
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({ locationSource: "link", latitude: -34.581 })
  })

  it("never trusts coordinates or labels sent by the client", async () => {
    const { full, repository } = setup()
    const forged = { ...input({ shareLocation: true, mapsUrl: PLACE_LINK }), lat: 1.23, lng: 4.56, label: "Casa de Ana", placeName: "x" }
    await createMemoryWith(full, forged as never)
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({ latitude: -34.581, longitude: -58.4208, placeName: "Plaza Italia" })
    expect(JSON.stringify(saved)).not.toMatch(/1\.23|4\.56|Casa de Ana/)
  })

  it.each([
    ["is not a Google host", "https://evil.example/maps/@1.5,2.5,3z"],
    ["has no position", "https://www.google.com/maps/place/Plaza+Italia"],
  ])("saves the memory with no location, and says so, when the link %s", async (_name, mapsUrl) => {
    const { full, repository } = setup({}, { info: photo() })
    const result = await createMemoryWith(full, input({ shareLocation: true, mapsUrl }))
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({ latitude: null, longitude: null, locationSource: null, placeName: null })
    expect(result).toMatchObject({ ok: true, locationSaved: false })
  })

  it("saves with no location when a short link cannot be followed", async () => {
    const { full, repository } = setup()
    const result = await createMemoryWith(full, input({ shareLocation: true, mapsUrl: "https://maps.app.goo.gl/AbCd" }))
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({ locationSource: null, latitude: null })
    expect(result).toMatchObject({ ok: true })
  })

  it("ignores the link, and does not resolve it, without consent", async () => {
    const { full, repository, follow, reverse } = setup()
    await createMemoryWith(full, input({ shareLocation: false, mapsUrl: "https://maps.app.goo.gl/AbCd" }))
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({ latitude: null, locationSource: null, placeName: null })
    expect(follow).not.toHaveBeenCalled()
    expect(reverse).not.toHaveBeenCalled()
  })

  it("treats a link that is not a string as no link, using the photo GPS", async () => {
    const { full, repository } = setup({}, { info: photo() })
    await createMemoryWith(full, input({ shareLocation: true, mapsUrl: { href: PLACE_LINK } }))
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({ locationSource: "photo", latitude: 40.7128 })
  })

  it("keeps the location, with no name, when naming it fails", async () => {
    const { full, repository, reverse } = setup()
    reverse.mockRejectedValueOnce(new Error("down"))
    const result = await createMemoryWith(full, input({ shareLocation: true, mapsUrl: NAMELESS }))
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({ latitude: 40.712812, locationSource: "link", placeName: null })
    expect(result).toMatchObject({ ok: true, locationSaved: true })
  })
})

const PARENT_ID = "22222222-2222-4222-8222-222222222222"
const parent = (over: Partial<Memory> = {}) =>
  stored({
    id: PARENT_ID,
    handle: "bea",
    status: "approved",
    latitude: -34.5871,
    longitude: -58.4302,
    placeName: "UOCRA",
    placeAddress: "Av. Rivadavia 1234, Junín",
    locationSource: "link",
    ...over,
  })

describe("createMemoryWith: a memory contributed from another", () => {
  it("stores the relation to an approved memory the visitor can see, and answers with its id", async () => {
    const { full, repository } = setup()
    vi.mocked(repository.findForVisitor).mockResolvedValueOnce(parent())
    vi.mocked(repository.createPending).mockImplementationOnce(async (_h, saved) => stored({ relatedMemoryId: saved.relatedMemoryId }))
    const result = await createMemoryWith(full, input({ relatedMemoryId: PARENT_ID }))
    expect(repository.findForVisitor).toHaveBeenCalledWith("ana", PARENT_ID)
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({ relatedMemoryId: PARENT_ID })
    expect(result).toMatchObject({ ok: true, memory: { relatedId: PARENT_ID } })
  })

  it("stores no relation when none is given, and does not look anything up", async () => {
    const { full, repository } = setup()
    const result = await createMemoryWith(full, input())
    expect(repository.findForVisitor).not.toHaveBeenCalled()
    expect(vi.mocked(repository.createPending).mock.calls[0][1]).toMatchObject({ relatedMemoryId: null })
    expect(result).toMatchObject({ ok: true, memory: { relatedId: null } })
  })

  it.each([
    ["not a uuid", "not-a-uuid"],
    ["a number", 42],
    ["an object", { id: PARENT_ID }],
    ["an empty string", ""],
  ])("drops a relation that is %s, silently, without a lookup", async (_label, relatedMemoryId) => {
    const { full, repository } = setup()
    const result = await createMemoryWith(full, input({ relatedMemoryId }))
    expect(repository.findForVisitor).not.toHaveBeenCalled()
    expect(vi.mocked(repository.createPending).mock.calls[0][1]).toMatchObject({ relatedMemoryId: null })
    expect(result).toMatchObject({ ok: true })
  })

  it("drops a relation to a memory that does not exist or that the visitor may not see, and still saves the memory", async () => {
    const { full, repository } = setup()
    vi.mocked(repository.findForVisitor).mockResolvedValueOnce(null)
    const result = await createMemoryWith(full, input({ relatedMemoryId: PARENT_ID }))
    expect(vi.mocked(repository.createPending).mock.calls[0][1]).toMatchObject({ relatedMemoryId: null })
    expect(result).toMatchObject({ ok: true })
  })

  it("drops a relation to a memory that is not approved yet (the database would refuse it)", async () => {
    const { full, repository } = setup()
    vi.mocked(repository.findForVisitor).mockResolvedValueOnce(parent({ status: "pending", handle: "ana" }))
    await createMemoryWith(full, input({ relatedMemoryId: PARENT_ID }))
    expect(vi.mocked(repository.createPending).mock.calls[0][1]).toMatchObject({ relatedMemoryId: null })
  })

  it("never fails the upload because the lookup failed", async () => {
    const { full, repository } = setup()
    vi.mocked(repository.findForVisitor).mockRejectedValueOnce(new Error("down"))
    const result = await createMemoryWith(full, input({ relatedMemoryId: PARENT_ID }))
    expect(result).toMatchObject({ ok: true })
    expect(vi.mocked(repository.createPending).mock.calls[0][1]).toMatchObject({ relatedMemoryId: null })
  })

  describe("when the relation is refused at insert (the parent changed after it was read)", () => {
    const refusals: [string, unknown][] = [
      ["a row-level security refusal (code)", Object.assign(new Error("denied"), { code: "42501" })],
      ["a row-level security refusal (driver meta)", Object.assign(new Error("denied"), { meta: { code: "42501" } })],
      ["a row-level security refusal (message)", new Error('new row violates row-level security policy for table "memories"')],
      ["a foreign key violation (Prisma)", Object.assign(new Error("fk"), { code: "P2003" })],
      ["a foreign key violation (PostgreSQL)", Object.assign(new Error("fk"), { code: "23503" })],
    ]

    it.each(refusals)("retries once without the relation after %s, keeping the rest, so the upload is not lost", async (_label, refusal) => {
      const { full, repository } = setup()
      vi.mocked(repository.findForVisitor).mockResolvedValueOnce(parent())
      vi.mocked(repository.createPending)
        .mockRejectedValueOnce(refusal)
        .mockImplementationOnce(async (_h, saved) => stored({ relatedMemoryId: saved.relatedMemoryId, caption: saved.caption }))
      const result = await createMemoryWith(full, input({ relatedMemoryId: PARENT_ID, caption: "kept" }))
      expect(repository.createPending).toHaveBeenCalledTimes(2)
      const [first, second] = vi.mocked(repository.createPending).mock.calls.map((call) => call[1])
      expect(first).toMatchObject({ relatedMemoryId: PARENT_ID, caption: "kept" })
      expect(second).toEqual({ ...first, relatedMemoryId: null })
      expect(result).toMatchObject({ ok: true, memory: { relatedId: null, caption: "kept" } })
    })

    it("does not retry without a relation, and fails as before", async () => {
      const { full, repository } = setup()
      vi.mocked(repository.createPending).mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "42501" }))
      const result = await createMemoryWith(full, input())
      expect(repository.createPending).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ ok: false, reason: "unavailable" })
    })

    it("does not retry an unrelated failure, nor a duplicate", async () => {
      const { full, repository } = setup()
      vi.mocked(repository.findForVisitor).mockResolvedValueOnce(parent())
      vi.mocked(repository.createPending).mockRejectedValueOnce(new Error("connection reset"))
      expect(await createMemoryWith(full, input({ relatedMemoryId: PARENT_ID }))).toEqual({ ok: false, reason: "unavailable" })
      expect(repository.createPending).toHaveBeenCalledTimes(1)

      vi.mocked(repository.findForVisitor).mockResolvedValueOnce(parent())
      vi.mocked(repository.createPending).mockRejectedValueOnce(new DuplicatePublicIdError())
      expect(await createMemoryWith(full, input({ relatedMemoryId: PARENT_ID }))).toEqual({ ok: false, reason: "duplicate" })
      expect(repository.createPending).toHaveBeenCalledTimes(2)
    })

    it("retries only once: a second refusal is a failure", async () => {
      const { full, repository } = setup()
      vi.mocked(repository.findForVisitor).mockResolvedValueOnce(parent())
      vi.mocked(repository.createPending).mockRejectedValue(Object.assign(new Error("denied"), { code: "42501" }))
      expect(await createMemoryWith(full, input({ relatedMemoryId: PARENT_ID }))).toEqual({ ok: false, reason: "unavailable" })
      expect(repository.createPending).toHaveBeenCalledTimes(2)
    })

    it("keeps the copied place when the relation is dropped", async () => {
      const { full, repository } = setup()
      vi.mocked(repository.findForVisitor).mockResolvedValueOnce(parent({ placeName: "Casa", latitude: -34.5, longitude: -58.4, locationSource: "link" }))
      vi.mocked(repository.createPending)
        .mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "42501" }))
        .mockImplementationOnce(async (_h, saved) => stored({ relatedMemoryId: saved.relatedMemoryId, placeName: saved.placeName }))
      await createMemoryWith(full, input({ relatedMemoryId: PARENT_ID, samePlace: true }))
      const second = vi.mocked(repository.createPending).mock.calls[1][1]
      expect(second).toMatchObject({ relatedMemoryId: null, placeName: "Casa" })
    })
  })

  describe("Mismo lugar", () => {
    const PLACE_LINK = "https://www.google.com/maps/place/Plaza+Italia/@-34.5810,-58.4208,17z"

    it("copies every place column of the related memory, with no consent to the photo's GPS and no geocoding", async () => {
      const { full, repository, reverse } = setup()
      vi.mocked(repository.findForVisitor).mockResolvedValueOnce(parent())
      const result = await createMemoryWith(full, input({ relatedMemoryId: PARENT_ID, samePlace: true }))
      const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
      expect(saved).toMatchObject({
        latitude: -34.5871,
        longitude: -58.4302,
        placeName: "UOCRA",
        placeAddress: "Av. Rivadavia 1234, Junín",
        locationSource: "link",
      })
      expect(reverse).not.toHaveBeenCalled()
      expect(result).toMatchObject({ ok: true, locationSaved: true })
    })

    it("only an explicit true chooses it", async () => {
      const { full, repository } = setup()
      vi.mocked(repository.findForVisitor).mockResolvedValueOnce(parent())
      await createMemoryWith(full, input({ relatedMemoryId: PARENT_ID, samePlace: "true" }))
      expect(vi.mocked(repository.createPending).mock.calls[0][1]).toMatchObject({ latitude: null, placeName: null, placeAddress: null })
    })

    it("copies nothing when the relation was dropped (an unknown memory has no place to give)", async () => {
      const { full, repository } = setup()
      vi.mocked(repository.findForVisitor).mockResolvedValueOnce(null)
      const result = await createMemoryWith(full, input({ relatedMemoryId: PARENT_ID, samePlace: true }))
      expect(vi.mocked(repository.createPending).mock.calls[0][1]).toMatchObject({ latitude: null, longitude: null, placeName: null })
      expect(result).toMatchObject({ ok: true, locationSaved: false })
    })

    it("copies nothing when the related memory has no place", async () => {
      const { full, repository } = setup()
      vi.mocked(repository.findForVisitor).mockResolvedValueOnce(
        parent({ latitude: null, longitude: null, placeName: null, placeAddress: null, locationSource: null }),
      )
      const result = await createMemoryWith(full, input({ relatedMemoryId: PARENT_ID, samePlace: true }))
      expect(vi.mocked(repository.createPending).mock.calls[0][1]).toMatchObject({ latitude: null, locationSource: null })
      expect(result).toMatchObject({ ok: true, locationSaved: false })
    })

    it("is overridden by a Maps link the visitor pasted", async () => {
      const { full, repository } = setup()
      vi.mocked(repository.findForVisitor).mockResolvedValueOnce(parent())
      await createMemoryWith(full, input({ relatedMemoryId: PARENT_ID, samePlace: true, shareLocation: true, mapsUrl: PLACE_LINK }))
      expect(vi.mocked(repository.createPending).mock.calls[0][1]).toMatchObject({ locationSource: "link", latitude: -34.581, placeName: "Plaza Italia" })
    })

    it("is overridden by the photo's own GPS when the visitor opted in to it", async () => {
      const { full, repository } = setup({}, { info: photo() })
      vi.mocked(repository.findForVisitor).mockResolvedValueOnce(parent())
      await createMemoryWith(full, input({ relatedMemoryId: PARENT_ID, samePlace: true, shareLocation: true }))
      expect(vi.mocked(repository.createPending).mock.calls[0][1]).toMatchObject({ locationSource: "photo", latitude: 40.7128 })
    })

    it("never sends the copied coordinates to the client: the answer is the coarse place", async () => {
      const { full, repository } = setup()
      vi.mocked(repository.findForVisitor).mockResolvedValueOnce(parent())
      vi.mocked(repository.createPending).mockImplementationOnce(async (_h, saved) =>
        stored({
          latitude: saved.latitude,
          longitude: saved.longitude,
          placeName: saved.placeName,
          placeAddress: saved.placeAddress,
          locationSource: saved.locationSource,
          relatedMemoryId: saved.relatedMemoryId,
        }),
      )
      const result = await createMemoryWith(full, input({ relatedMemoryId: PARENT_ID, samePlace: true }))
      if (!result.ok) throw new Error("expected ok")
      expect(result.memory.place).toEqual({ lat: -34.59, lng: -58.43, name: "UOCRA", address: "Av. Rivadavia 1234, Junín" })
      expect(JSON.stringify(result)).not.toMatch(/34\.5871|58\.4302/)
    })
  })
})

describe("createMemoryWith: the orb color", () => {
  const saved = async (over: Parameters<typeof input>[0], info: AssetInfo | null = photo()) => {
    const { full, repository } = setup({}, { info })
    await createMemoryWith(full, input(over))
    return vi.mocked(repository.createPending).mock.calls[0][1]
  }

  it("stores the color the visitor chose when it is a valid glowing #rrggbb", async () => {
    expect(await saved({ orbColor: "#ff9a3c" })).toMatchObject({ orbColor: "#ff9a3c" })
  })

  it("lowercases the color it stores", async () => {
    expect(await saved({ orbColor: "#FF9A3C" })).toMatchObject({ orbColor: "#ff9a3c" })
  })

  it.each([
    ["too dark for the void", "#112233"],
    ["black", "#000000"],
    ["a grey with no chroma", "#c0c0c0"],
    ["not a hex color", "orange"],
    ["a 3-digit hex", "#f93"],
    ["a CSS function", "rgb(255, 154, 60)"],
    ["a script", "#ff9a3c;} body{display:none"],
    ["not a string", 42],
    ["an object", { hex: "#ff9a3c" }],
    ["null", null],
  ])("falls back to the adjusted dominant color of the photo when the color is %s", async (_name, orbColor) => {
    const out = await saved({ orbColor })
    // The photo's dominant color is #112233 (see COLORS): lifted to glow, same hue.
    expect(out.orbColor).toBe(glowColor("#112233"))
    expect(isGlowColor(out.orbColor)).toBe(true)
  })

  it("falls back to the adjusted dominant color when no color is sent", async () => {
    const out = await saved({})
    expect(out.orbColor).toBe(glowColor("#112233"))
  })

  it("falls back to the default cool tone when the photo has no dominant color either", async () => {
    const out = await saved({ orbColor: "nope" }, asset())
    expect(out.orbColor).toBe(DEFAULT_ORB_COLOR)
  })

  it("never stores a color that would not glow, whatever the browser says", async () => {
    for (const orbColor of ["#000000", "#010101", "#222222", "#ffffff", "#123456", "bad", undefined]) {
      expect(isGlowColor((await saved({ orbColor })).orbColor)).toBe(true)
    }
  })

  it("answers the new memory with its orb color, valid and glowing", async () => {
    const { full, repository } = setup({}, { info: photo() })
    vi.mocked(repository.createPending).mockResolvedValueOnce(stored({ orbColor: "#a58cff" }))
    const result = await createMemoryWith(full, input({ orbColor: "#a58cff" }))
    if (!result.ok) throw new Error("expected ok")
    expect(result.memory.orbColor).toBe("#a58cff")
  })

  it("keeps the orb color independent of the location consent", async () => {
    expect(await saved({ orbColor: "#ff9a3c", shareLocation: false })).toMatchObject({
      orbColor: "#ff9a3c",
      latitude: null,
    })
  })
})

describe("createMemoryWith: audio", () => {
  const audioIn = (over: Parameters<typeof input>[0] = {}) => input({ ticket: voiceTicket(), ...over })
  const bothIn = (over: Parameters<typeof input>[0] = {}) => input({ ticket: ticketFor({ aid: AID }), ...over })

  it("stores an audio-only memory: the audio facts come from Cloudinary and the photo columns stay empty", async () => {
    const { full, repository, assets } = setup({}, { audio: voice({ bytes: 321_000, durationSeconds: 61.235, format: "M4A" }) })
    const result = await createMemoryWith(full, audioIn({ caption: "  Mi voz  " }))
    expect(assets.describeAudio).toHaveBeenCalledWith(AID)
    expect(assets.describe).not.toHaveBeenCalled()
    expect(repository.createPending).toHaveBeenCalledWith("ana", {
      publicId: null,
      caption: "Mi voz",
      happenedOn: new Date("2024-03-12T00:00:00.000Z"),
      width: null,
      height: null,
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
      orbColor: DEFAULT_ORB_COLOR,
      relatedMemoryId: null,
      audio: { publicId: AID, format: "m4a", bytes: 321_000, durationMs: 61_235 },
    })
    expect(assets.destroy).not.toHaveBeenCalled()
    expect(assets.destroyAudio).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })

  it("stores a photo with an audio, verifying both", async () => {
    const { full, repository, assets } = setup({}, { info: photo() })
    const result = await createMemoryWith(full, bothIn())
    expect(assets.describe).toHaveBeenCalledWith(PID)
    expect(assets.describeAudio).toHaveBeenCalledWith(AID)
    const [, saved] = vi.mocked(repository.createPending).mock.calls[0]
    expect(saved).toMatchObject({
      publicId: PID,
      width: 4032,
      height: 3024,
      format: "jpg",
      dominantColor: "#112233",
      audio: { publicId: AID, format: "webm", bytes: 200_000, durationMs: 42_500 },
    })
    expect(result.ok).toBe(true)
  })

  it("answers the new memory with a null photo, and a signed mp3 URL with the duration", async () => {
    const { full, repository } = setup()
    vi.mocked(repository.createPending).mockResolvedValueOnce(
      stored({
        publicId: null,
        width: null,
        height: null,
        format: null,
        bytes: null,
        audio: { publicId: AID, format: "webm", bytes: 200_000, durationMs: 42_500 },
      }),
    )
    const result = await createMemoryWith(full, audioIn())
    if (!result.ok) throw new Error("expected ok")
    expect(result.memory).toMatchObject({
      width: null,
      height: null,
      thumbUrl: null,
      fullUrl: null,
      audio: { url: "/api/memories/11111111-1111-4111-8111-111111111111/audio", durationMs: 42_500 },
    })
    expect(JSON.stringify(result)).not.toMatch(/publicId|audioPublicId|"format"|"bytes"/)
  })

  it.each<[string, AudioInfo, string]>([
    ["is not audio (a video with pictures)", voice({ isAudio: false }), "audio_type"],
    ["is a public upload", voice({ type: "upload" }), "audio_type"],
    ["is an image", voice({ resourceType: "image" }), "audio_type"],
    ["has a format we do not allow", voice({ format: "flac" }), "audio_type"],
    ["has no duration", voice({ durationSeconds: null }), "audio_type"],
    ["is over the size cap", voice({ bytes: MAX_AUDIO_BYTES + 1 }), "audio_too_large"],
    ["is longer than 60 minutes", voice({ durationSeconds: MAX_AUDIO_MS / 1000 + 10 }), "audio_too_long"],
  ])("destroys the audio and refuses when it %s", async (_name, info, reason) => {
    const { full, repository, assets } = setup({}, { audio: info })
    expect(await createMemoryWith(full, audioIn())).toEqual({ ok: false, reason })
    expect(assets.destroyAudio).toHaveBeenCalledWith(AID)
    expect(repository.createPending).not.toHaveBeenCalled()
  })

  it("destroys the photo too when only the audio fails", async () => {
    const { full, assets } = setup({}, { info: photo(), audio: voice({ bytes: MAX_AUDIO_BYTES + 1 }) })
    expect(await createMemoryWith(full, bothIn())).toEqual({ ok: false, reason: "audio_too_large" })
    expect(assets.destroy).toHaveBeenCalledWith(PID)
    expect(assets.destroyAudio).toHaveBeenCalledWith(AID)
  })

  it("destroys the audio too when only the photo fails, and never reads the audio first", async () => {
    const { full, assets } = setup({}, { info: asset({ format: "gif" }) })
    expect(await createMemoryWith(full, bothIn())).toEqual({ ok: false, reason: "asset_type" })
    expect(assets.destroy).toHaveBeenCalledWith(PID)
    expect(assets.destroyAudio).toHaveBeenCalledWith(AID)
  })

  it("answers audio_missing when Cloudinary has no audio, with nothing to destroy for it", async () => {
    const { full, assets } = setup({}, { audio: null })
    expect(await createMemoryWith(full, audioIn())).toEqual({ ok: false, reason: "audio_missing" })
    expect(assets.destroyAudio).not.toHaveBeenCalled()
  })

  it("destroys the audio when the photo is missing, but not the photo that is not there", async () => {
    const { full, assets } = setup({}, { info: null })
    expect(await createMemoryWith(full, bothIn())).toEqual({ ok: false, reason: "asset_missing" })
    expect(assets.destroy).not.toHaveBeenCalled()
    expect(assets.destroyAudio).toHaveBeenCalledWith(AID)
  })

  it("answers unavailable, cleaning up both, when Cloudinary cannot answer about the audio", async () => {
    const { full, assets } = setup({}, { info: photo() })
    vi.mocked(assets.describeAudio).mockRejectedValueOnce(new Error("503"))
    expect(await createMemoryWith(full, bothIn())).toEqual({ ok: false, reason: "unavailable" })
    expect(assets.destroy).toHaveBeenCalledWith(PID)
    expect(assets.destroyAudio).toHaveBeenCalledWith(AID)
  })

  it("still answers with the original failure when an audio cleanup fails too", async () => {
    const { full, assets } = setup({}, { audio: voice({ format: "flac" }) })
    vi.mocked(assets.destroyAudio).mockRejectedValueOnce(new Error("503"))
    expect(await createMemoryWith(full, audioIn())).toEqual({ ok: false, reason: "audio_type" })
  })

  it("destroys every uploaded asset when the validation fails or the rate limit is reached", async () => {
    const invalid = setup({}, { info: photo() })
    expect(await createMemoryWith(invalid.full, bothIn({ caption: " " }))).toMatchObject({ ok: false, reason: "invalid" })
    expect(invalid.assets.destroy).toHaveBeenCalledWith(PID)
    expect(invalid.assets.destroyAudio).toHaveBeenCalledWith(AID)

    const limited = setup({}, { recent: 5 })
    expect(await createMemoryWith(limited.full, audioIn())).toEqual({ ok: false, reason: "rate_limited" })
    expect(limited.assets.destroyAudio).toHaveBeenCalledWith(AID)
  })

  it("keeps both assets when the insert hits a duplicate id", async () => {
    const { full, repository, assets } = setup({}, { info: photo() })
    vi.mocked(repository.createPending).mockRejectedValueOnce(new DuplicatePublicIdError())
    expect(await createMemoryWith(full, bothIn())).toEqual({ ok: false, reason: "duplicate" })
    expect(assets.destroy).not.toHaveBeenCalled()
    expect(assets.destroyAudio).not.toHaveBeenCalled()
  })

  it("gives an audio-only memory the color the visitor chose, or the default glow", async () => {
    const chosen = setup()
    await createMemoryWith(chosen.full, audioIn({ orbColor: "#a58cff" }))
    expect(vi.mocked(chosen.repository.createPending).mock.calls[0][1]).toMatchObject({ orbColor: "#a58cff" })

    const dark = setup()
    await createMemoryWith(dark.full, audioIn({ orbColor: "#112233" }))
    expect(vi.mocked(dark.repository.createPending).mock.calls[0][1]).toMatchObject({ orbColor: DEFAULT_ORB_COLOR })
  })

  it("stores a place for an audio-only memory only from a Maps link, never from a photo it does not have", async () => {
    const withLink = setup()
    await createMemoryWith(
      withLink.full,
      audioIn({ shareLocation: true, mapsUrl: "https://www.google.com/maps/place/Plaza+Italia/@-34.5810,-58.4208,17z" }),
    )
    expect(vi.mocked(withLink.repository.createPending).mock.calls[0][1]).toMatchObject({
      latitude: -34.581,
      longitude: -58.4208,
      locationSource: "link",
      placeName: "Plaza Italia",
    })

    const noLink = setup()
    const result = await createMemoryWith(noLink.full, audioIn({ shareLocation: true }))
    expect(vi.mocked(noLink.repository.createPending).mock.calls[0][1]).toMatchObject({
      latitude: null,
      locationSource: null,
    })
    expect(result).toMatchObject({ ok: true, locationSaved: false })
    expect(noLink.reverse).not.toHaveBeenCalled()
  })

  it("refuses a ticket that covers neither a photo nor an audio, touching nothing", async () => {
    const { full, assets } = setup()
    const token = signUploadTicket({ h: "ana", exp: NOW + 600 }, SECRET)
    expect(await createMemoryWith(full, input({ ticket: token }))).toEqual({ ok: false, reason: "invalid_ticket" })
    expect(assets.describe).not.toHaveBeenCalled()
    expect(assets.describeAudio).not.toHaveBeenCalled()
  })
})
