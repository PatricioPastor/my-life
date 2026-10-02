import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))

import { memoryAudioPath } from "./audio-path"
import { FULL_TRANSFORM, THUMB_TRANSFORM, cloudinaryUrl, squareTransform } from "./cloudinary-url"
import type { Memory } from "./memory"
import type { MemoryRepository } from "./memory-repository"
import { DEFAULT_ORB_COLOR, glowColor, isGlowColor } from "./orb-color"
import { listMemoriesWith, type ListMemoriesDeps } from "./list-memories"

const memory = (over: Partial<Memory> = {}): Memory => ({
  id: "11111111-1111-4111-8111-111111111111",
  handle: "ana",
  publicId: "memories/a b",
  caption: "Una tarde",
  happenedOn: new Date("2024-03-12T00:00:00.000Z"),
  width: 800,
  height: 600,
  status: "approved",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  kind: "image",
  format: "jpg",
  bytes: 1000,
  takenAt: new Date("2024-03-12T12:05:09.000Z"),
  dominantColor: "#112233",
  palette: [{ color: "#112233", share: 40 }],
  metadata: { Make: "Apple" },
  latitude: 40.712812,
  longitude: -74.006009,
  placeName: "Nueva York",
  locationSource: "photo",
  orbColor: "#ff9a3c",
  audio: null,
  ...over,
})

function deps(over: Partial<ListMemoriesDeps> = {}, rows: Memory[] = [memory()]) {
  const repository: MemoryRepository = {
    listForVisitor: vi.fn(async () => rows),
    findForVisitor: vi.fn(),
    createPending: vi.fn(),
    countRecentBy: vi.fn(),
  }
  const full: ListMemoriesDeps = {
    currentVisitor: async () => ({ handle: "ana" }),
    repository: () => repository,
    cloudinary: { cloudName: "demo", apiSecret: "abcd" },
    log: vi.fn(),
    ...over,
  }
  return { full, repository }
}

describe("listMemoriesWith", () => {
  it("answers no_session without touching the repository when nobody is admitted", async () => {
    const { full, repository } = deps({ currentVisitor: async () => null })
    expect(await listMemoriesWith(full)).toEqual({ ok: false, reason: "no_session" })
    expect(repository.listForVisitor).not.toHaveBeenCalled()
  })

  it("lists for the session's handle and maps rows to DTOs", async () => {
    const { full, repository } = deps()
    const result = await listMemoriesWith(full)
    expect(repository.listForVisitor).toHaveBeenCalledWith("ana")
    expect(result).toEqual({
      ok: true,
      memories: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          caption: "Una tarde",
          happenedOn: "2024-03-12",
          status: "approved",
          width: 800,
          height: 600,
          kind: "image",
          takenAt: "2024-03-12T12:05:09.000Z",
          dominantColor: "#112233",
          place: { lat: 40.71, lng: -74.01, name: "Nueva York" },
          orbColor: "#ff9a3c",
          thumbUrl: cloudinaryUrl("demo", "memories/a b", THUMB_TRANSFORM, "abcd"),
          fullUrl: cloudinaryUrl("demo", "memories/a b", FULL_TRANSFORM, "abcd"),
          // An 800 x 600 photo: every rung its 600 px side fills, plus 600 itself; nothing is upscaled.
          photo: {
            sizes: [96, 192, 384, 600].map((width) => ({
              width,
              url: cloudinaryUrl("demo", "memories/a b", squareTransform(width), "abcd"),
            })),
          },
          audio: null,
        },
      ],
    })
  })

  it("signs the photo at every size of the width ladder for a big photo, square and face-aware", async () => {
    const { full } = deps({}, [memory({ width: 4032, height: 3024 })])
    const result = await listMemoriesWith(full)
    const sizes = result.ok ? result.memories[0].photo?.sizes : null
    expect(sizes?.map((s) => s.width)).toEqual([96, 192, 384, 768, 1600])
    for (const size of sizes ?? []) {
      expect(size.url).toContain(`c_fill,g_auto,w_${size.width},h_${size.width}`)
      expect(size.url).toContain("/image/authenticated/s--")
    }
  })

  it("never leaks the handle or the public id", async () => {
    const { full } = deps()
    const result = await listMemoriesWith(full)
    const json = JSON.stringify(result)
    expect(json).not.toContain("ana")
    expect(json).not.toContain("publicId")
  })

  it("never sends the exact location, the source, the palette or the metadata to the client", async () => {
    const { full } = deps()
    const json = JSON.stringify(await listMemoriesWith(full))
    expect(json).not.toMatch(/latitude|longitude|approx|locationSource|palette|metadata|Apple|40\.7128|74\.006/i)
  })

  it("sends a coarse place (2 decimals) with its name, rounding half away from zero", async () => {
    const { full } = deps({}, [memory({ latitude: -34.595, longitude: -58.425, placeName: "Palermo" })])
    const result = await listMemoriesWith(full)
    expect(result.ok && result.memories[0].place).toEqual({ lat: -34.6, lng: -58.43, name: "Palermo" })
  })

  it("has a place with no name when the location has none, and no place without a location", async () => {
    const { full } = deps({}, [
      memory({ id: "a", placeName: null }),
      memory({ id: "b", latitude: null, longitude: null, placeName: null, locationSource: null }),
    ])
    const result = await listMemoriesWith(full)
    expect(result.ok && result.memories.map((m) => m.place)).toEqual([{ lat: 40.71, lng: -74.01, name: null }, null])
  })

  describe("orb color", () => {
    const colorOf = async (row: Memory) => {
      const result = await listMemoriesWith(deps({}, [row]).full)
      return result.ok ? result.memories[0].orbColor : undefined
    }

    it("sends the stored color", async () => {
      expect(await colorOf(memory({ orbColor: "#a58cff" }))).toBe("#a58cff")
    })

    it("derives one for older rows with none: the dominant color, lifted to glow", async () => {
      expect(await colorOf(memory({ orbColor: null, dominantColor: "#112233" }))).toBe(glowColor("#112233"))
    })

    it("falls back to the default cool tone for an older row with no color at all", async () => {
      expect(await colorOf(memory({ orbColor: null, dominantColor: null }))).toBe(DEFAULT_ORB_COLOR)
    })

    it("never sends a stored color that would not glow, or is not a color", async () => {
      for (const orbColor of ["#000000", "red", "#fff", "</style>"]) {
        const out = await colorOf(memory({ orbColor, dominantColor: null }))
        expect(isGlowColor(out)).toBe(true)
      }
    })
  })

  it("has a null taken date and color when the photo had none", async () => {
    const { full } = deps({}, [memory({ takenAt: null, dominantColor: null })])
    const result = await listMemoriesWith(full)
    expect(result.ok && result.memories[0]).toMatchObject({ takenAt: null, dominantColor: null })
  })

  it("keeps the repository's order and marks pending ones", async () => {
    const { full } = deps({}, [
      memory({ id: "a", status: "approved" }),
      memory({ id: "b", status: "pending" }),
    ])
    const result = await listMemoriesWith(full)
    expect(result.ok && result.memories.map((m) => [m.id, m.status])).toEqual([
      ["a", "approved"],
      ["b", "pending"],
    ])
  })

  it("drops rejected memories", async () => {
    const { full } = deps({}, [memory({ id: "a" }), memory({ id: "r", status: "rejected" })])
    const result = await listMemoriesWith(full)
    expect(result.ok && result.memories.map((m) => m.id)).toEqual(["a"])
  })

  it("answers unavailable, with one handle-free log line, when the repository throws", async () => {
    const log = vi.fn()
    const { full } = deps({
      log,
      repository: () => ({
        listForVisitor: async () => {
          throw new Error("DATABASE_URL uses ana's owner role")
        },
        findForVisitor: vi.fn(),
        createPending: vi.fn(),
    countRecentBy: vi.fn(),
      }),
    })
    expect(await listMemoriesWith(full)).toEqual({ ok: false, reason: "unavailable" })
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0][0])).not.toContain("ana")
  })

  it("answers unavailable when building the repository throws (the runtime guard)", async () => {
    const { full } = deps({
      repository: () => {
        throw new Error("guard")
      },
    })
    expect(await listMemoriesWith(full)).toEqual({ ok: false, reason: "unavailable" })
  })

  it("answers unavailable when the session lookup throws", async () => {
    const { full } = deps({
      currentVisitor: async () => {
        throw new Error("no request scope")
      },
    })
    expect(await listMemoriesWith(full)).toEqual({ ok: false, reason: "unavailable" })
  })

  it.each([
    ["no Cloudinary config", null],
    ["an empty cloud name", { cloudName: "", apiSecret: "abcd" }],
    ["an empty API secret", { cloudName: "demo", apiSecret: "" }],
  ])("answers unavailable with %s", async (_name, cloudinary) => {
    const { full, repository } = deps({ cloudinary })
    expect(await listMemoriesWith(full)).toEqual({ ok: false, reason: "unavailable" })
    expect(repository.listForVisitor).not.toHaveBeenCalled()
  })

  it("answers unavailable when a stored public id cannot make a URL", async () => {
    const { full } = deps({}, [memory({ publicId: "a/../b" })])
    expect(await listMemoriesWith(full)).toEqual({ ok: false, reason: "unavailable" })
  })
})

describe("listMemoriesWith: photo, audio or both", () => {
  const AID = "my-life/memories/audio-9a8b7c6d"
  const audio = { publicId: AID, format: "webm", bytes: 200_000, durationMs: 42_500 }
  const list = async (row: Memory) => {
    const { full } = deps({}, [row])
    const result = await listMemoriesWith(full)
    if (!result.ok) throw new Error("expected ok")
    return result.memories[0]
  }

  it("sends no photo sizes for a voice with no photo", async () => {
    const view = await list(memory({ publicId: null, width: null, height: null, format: null, bytes: null, audio }))
    expect(view.photo).toBeNull()
  })

  it("maps a photo-only memory with a null audio", async () => {
    expect(await list(memory())).toMatchObject({ audio: null, width: 800, height: 600 })
  })

  it("maps an audio-only memory: no photo fields, and a signed mp3 URL with the duration", async () => {
    const view = await list(
      memory({ publicId: null, width: null, height: null, format: null, bytes: null, dominantColor: null, audio }),
    )
    expect(view).toMatchObject({
      width: null,
      height: null,
      thumbUrl: null,
      fullUrl: null,
      kind: "image",
      audio: { url: "/api/memories/11111111-1111-4111-8111-111111111111/audio", durationMs: 42_500 },
    })
  })

  it("maps a photo with an audio: both are present", async () => {
    const view = await list(memory({ audio }))
    expect(view.thumbUrl).toBe(cloudinaryUrl("demo", "memories/a b", THUMB_TRANSFORM, "abcd"))
    expect(view.audio).toEqual({ url: memoryAudioPath("11111111-1111-4111-8111-111111111111"), durationMs: 42_500 })
  })

  it("points the audio at our own route, never at Cloudinary: the signed URL stays on the server", async () => {
    const view = await list(memory({ audio }))
    expect(view.audio!.url).toBe("/api/memories/11111111-1111-4111-8111-111111111111/audio")
    expect(JSON.stringify(view.audio)).not.toMatch(/s--|cloudinary|f_mp3|abcd/)
  })

  it("gives an audio-only memory a glowing orb color even when none was stored", async () => {
    const view = await list(memory({ publicId: null, width: null, height: null, dominantColor: null, orbColor: null, audio }))
    expect(view.orbColor).toBe(DEFAULT_ORB_COLOR)
  })

  it("never leaks the audio public id, format or size", async () => {
    const view = await list(memory({ audio }))
    const json = JSON.stringify(view)
    expect(json).not.toMatch(/"format"|"bytes"|publicId|audioPublicId/)
  })

  it("lists a memory with neither (a corrupt row) without crashing the listing", async () => {
    const { full } = deps({}, [memory({ publicId: null, width: null, height: null, audio: null }), memory({ id: "2" })])
    const result = await listMemoriesWith(full)
    expect(result.ok && result.memories.map((m) => m.id)).toEqual(["2"])
  })
})
