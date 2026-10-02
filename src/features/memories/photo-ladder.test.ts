import { describe, expect, it } from "vitest"
import type { MemoryView } from "./memory-view"
import {
  MAX_UPSCALE,
  PHOTO_RUNGS,
  approachSizes,
  bestDecoded,
  deliverySides,
  ladderOf,
  pickSize,
  type PhotoSize,
} from "./photo-ladder"

const sizes: PhotoSize[] = PHOTO_RUNGS.map((width) => ({ width, url: `u${width}` }))

describe("the width ladder", () => {
  it("is a short ladder of doubling widths, so a few cached sizes serve every screen", () => {
    expect(PHOTO_RUNGS).toEqual([96, 192, 384, 768, 1600])
  })

  it("delivers every rung the photo can fill without being upscaled", () => {
    expect(deliverySides(4000, 3000)).toEqual([96, 192, 384, 768, 1600])
  })

  it("adds the photo's own shorter side when it falls between rungs, and nothing above it", () => {
    expect(deliverySides(1200, 900)).toEqual([96, 192, 384, 768, 900])
    expect(deliverySides(800, 1600)).toEqual([96, 192, 384, 768, 800])
  })

  it("never offers a side bigger than the photo, even a tiny one", () => {
    expect(deliverySides(150, 400)).toEqual([96, 150])
    expect(deliverySides(60, 60)).toEqual([60])
    expect(deliverySides(768, 1024)).toEqual([96, 192, 384, 768])
  })
})

describe("picking the size to fetch", () => {
  it("takes the smallest size that is never shown upscaled more than about 1.25 times", () => {
    expect(MAX_UPSCALE).toBe(1.25)
    // A 40 px orb on a 1x screen needs 40 px: the 96 px crop is plenty.
    expect(pickSize(sizes, 40, 1)?.width).toBe(96)
    // The same orb zoomed in on a 2x screen: 88 css px x 2 = 176 px, so 192.
    expect(pickSize(sizes, 88, 2)?.width).toBe(192)
    // 236 device px: 192 x 1.25 = 240 still covers it, so the cache keeps serving 192.
    expect(pickSize(sizes, 118, 2)?.width).toBe(192)
    expect(pickSize(sizes, 122, 2)?.width).toBe(384)
  })

  it("follows the device pixel ratio for the glass", () => {
    expect(pickSize(sizes, 558, 1)?.width).toBe(768)
    expect(pickSize(sizes, 558, 2)?.width).toBe(1600)
    expect(pickSize(sizes, 312, 3)?.width).toBe(768)
  })

  it("falls back to the largest size when even that is too small", () => {
    expect(pickSize(sizes, 2000, 2)?.width).toBe(1600)
    expect(pickSize([{ width: 900, url: "a" }], 1200, 1)?.width).toBe(900)
  })

  it("has nothing to pick from an empty ladder", () => {
    expect(pickSize([], 100, 1)).toBeNull()
  })
})

describe("the best decoded size", () => {
  const decoded = (...widths: number[]) => (url: string) => widths.some((w) => url === `u${w}`)

  it("shows the smallest decoded size that is sharp enough", () => {
    expect(bestDecoded(sizes, decoded(96, 384, 1600), 200, 1)?.width).toBe(384)
  })

  it("otherwise shows the largest one decoded so far, never a blank", () => {
    expect(bestDecoded(sizes, decoded(96, 192), 558, 2)?.width).toBe(192)
  })

  it("is null only when nothing has decoded yet", () => {
    expect(bestDecoded(sizes, decoded(), 558, 2)).toBeNull()
  })
})

describe("warming an approach", () => {
  it("asks for a mid size first, so something sharp arrives early, then the size the glass needs", () => {
    expect(approachSizes(sizes, 558, 2).map((s) => s.width)).toEqual([384, 1600])
    expect(approachSizes(sizes, 312, 3).map((s) => s.width)).toEqual([384, 768])
  })

  it("asks once when the mid size already is the full one", () => {
    expect(approachSizes([{ width: 96, url: "a" }, { width: 300, url: "b" }], 558, 2).map((s) => s.width)).toEqual([300])
  })
})

describe("a memory's ladder", () => {
  const base = {
    id: "m",
    caption: "c",
    happenedOn: "2024-01-01",
    status: "approved",
    width: 800,
    height: 600,
    kind: "image",
    takenAt: null,
    dominantColor: null,
    place: null,
    orbColor: "#8ab4ff",
    viewCount: 0,
    relatedId: null,
    audio: null,
  } satisfies Omit<MemoryView, "thumbUrl" | "fullUrl">

  it("is the signed square crops the server sends", () => {
    const memory: MemoryView = { ...base, thumbUrl: "t", fullUrl: "f", photo: { sizes } }
    expect(ladderOf(memory)).toBe(sizes)
  })

  it("falls back to the thumbnail and the full photo when the server sent no ladder", () => {
    const memory: MemoryView = { ...base, thumbUrl: "t", fullUrl: "f" }
    expect(ladderOf(memory)).toEqual([
      { width: 160, url: "t" },
      { width: 1600, url: "f" },
    ])
  })

  it("is empty for a voice with no photo", () => {
    expect(ladderOf({ ...base, width: null, height: null, thumbUrl: null, fullUrl: null })).toEqual([])
  })
})
