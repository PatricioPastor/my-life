import { describe, expect, it, vi } from "vitest"
import { readPhotoGps } from "./photo-gps"

const FILE = new File(["x"], "foto.jpg", { type: "image/jpeg" })
const parse = (value: { latitude: number; longitude: number } | undefined) => vi.fn(async () => value)

describe("readPhotoGps", () => {
  it("returns the exact position, trimmed to 6 decimals (the precision that is stored)", async () => {
    expect(await readPhotoGps(FILE, parse({ latitude: -34.5937012345, longitude: -58.4251236789 }))).toEqual({
      lat: -34.593701,
      lng: -58.425124,
    })
  })

  it("hands the parser only the file", async () => {
    const parser = parse({ latitude: 1.234, longitude: 2.345 })
    await readPhotoGps(FILE, parser)
    expect(parser).toHaveBeenCalledWith(FILE)
  })

  it.each([
    ["no GPS block", undefined],
    ["a missing longitude", { latitude: 10 } as never],
    ["NaN", { latitude: Number.NaN, longitude: 1 }],
    ["latitude out of range", { latitude: 91, longitude: 1 }],
    ["longitude out of range", { latitude: 1, longitude: 181 }],
    ["the 0,0 no-fix position", { latitude: 0, longitude: 0 }],
    ["a position that rounds to 0,0", { latitude: 0.0000001, longitude: -0.0000002 }],
  ])("gives null for %s", async (_label, value) => {
    expect(await readPhotoGps(FILE, parse(value))).toBeNull()
  })

  it("gives null when the parser throws or rejects", async () => {
    expect(await readPhotoGps(FILE, async () => Promise.reject(new Error("bad file")))).toBeNull()
    expect(
      await readPhotoGps(FILE, () => {
        throw new Error("sync")
      }),
    ).toBeNull()
  })
})

/** A JPEG whose EXIF carries only a GPS block: 34 35' 37.32" S, 58 25' 30.36" W (about -34.5937, -58.4251). */
function geotaggedJpeg(): Blob {
  const tiff = new Uint8Array(128)
  const view = new DataView(tiff.buffer)
  tiff.set([0x49, 0x49, 0x2a, 0x00])
  view.setUint32(4, 8, true)
  // IFD0: one entry, the pointer to the GPS IFD at offset 26.
  view.setUint16(8, 1, true)
  view.setUint16(10, 0x8825, true)
  view.setUint16(12, 4, true)
  view.setUint32(14, 1, true)
  view.setUint32(18, 26, true)
  view.setUint32(22, 0, true)
  // GPS IFD: LatRef, Lat, LonRef, Lon.
  view.setUint16(26, 4, true)
  const entry = (at: number, tag: number, type: number, count: number, value: number | number[]) => {
    view.setUint16(at, tag, true)
    view.setUint16(at + 2, type, true)
    view.setUint32(at + 4, count, true)
    if (Array.isArray(value)) tiff.set(value, at + 8)
    else view.setUint32(at + 8, value, true)
  }
  entry(28, 0x0001, 2, 2, [0x53, 0])
  entry(40, 0x0002, 5, 3, 80)
  entry(52, 0x0003, 2, 2, [0x57, 0])
  entry(64, 0x0004, 5, 3, 104)
  const rationals = (at: number, parts: Array<[number, number]>) =>
    parts.forEach(([n, d], i) => {
      view.setUint32(at + i * 8, n, true)
      view.setUint32(at + i * 8 + 4, d, true)
    })
  rationals(80, [[34, 1], [35, 1], [3732, 100]])
  rationals(104, [[58, 1], [25, 1], [3036, 100]])

  const app1Length = 2 + 6 + tiff.length
  const header = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, app1Length >> 8, app1Length & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0])
  return new Blob([header, tiff, new Uint8Array([0xff, 0xd9])], { type: "image/jpeg" })
}

describe("readPhotoGps with the real exifr parser", () => {
  it("reads only the GPS of a geotagged JPEG, exact", async () => {
    // 34 35' 37.32" S = -34.5937, 58 25' 30.36" W = -58.4251
    expect(await readPhotoGps(geotaggedJpeg() as File)).toEqual({ lat: -34.5937, lng: -58.4251 })
  })

  it("gives null for a file with no EXIF", async () => {
    expect(await readPhotoGps(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])]) as File)).toBeNull()
  })
})
