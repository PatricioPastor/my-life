import { describe, expect, it, vi } from "vitest"

// The real exifr, counted: the GPS and the date of one photo must come from a single parse.
const parses = vi.hoisted(() => ({ count: 0 }))
vi.mock("exifr/dist/lite.esm.mjs", async (importOriginal) => {
  const exifr = await importOriginal<typeof import("exifr/dist/lite.esm.mjs")>()
  return {
    ...exifr,
    parse: (...args: Parameters<typeof exifr.parse>) => {
      parses.count += 1
      return exifr.parse(...args)
    },
  }
})

import { exifClock, parsePhotoTimeWithExifr, readPhotoTaken } from "./photo-exif"
import { readPhotoGps } from "./photo-gps"

const FILE = new File(["x"], "foto.jpg", { type: "image/jpeg" })

describe("exifClock", () => {
  it("reads the camera's wall clock as it was written, with no time zone, to the minute", () => {
    expect(exifClock("2024:03:14 18:42:07")).toEqual({ date: "2024-03-14", time: "18:42" })
    expect(exifClock("1999:12:31 23:59:59")).toEqual({ date: "1999-12-31", time: "23:59" })
  })

  it("accepts the dashes and the T some tools write, and a missing seconds field", () => {
    expect(exifClock("2024-03-14T18:42:07")).toEqual({ date: "2024-03-14", time: "18:42" })
    expect(exifClock("2024:03:14 18:42")).toEqual({ date: "2024-03-14", time: "18:42" })
  })

  it.each([
    ["the empty clock some cameras write", "0000:00:00 00:00:00"],
    ["a day that does not exist", "2023:02:29 10:00:00"],
    ["month 13", "2024:13:01 10:00:00"],
    ["hour 24", "2024:03:14 24:00:00"],
    ["minute 60", "2024:03:14 18:60:00"],
    ["no time", "2024:03:14"],
    ["text", "yesterday"],
    ["a Date (a revived value carries a time zone)", new Date(2024, 2, 14)],
    ["nothing", undefined],
  ])("has nothing for %s", (_name, raw) => {
    expect(exifClock(raw)).toBeNull()
  })
})

describe("readPhotoTaken", () => {
  const parse = (value: { DateTimeOriginal?: unknown; CreateDate?: unknown } | undefined) => vi.fn(async () => value)

  it("takes DateTimeOriginal, when the shutter fired", () => {
    return expect(
      readPhotoTaken(FILE, parse({ DateTimeOriginal: "2024:03:14 18:42:07", CreateDate: "2024:03:15 09:00:00" })),
    ).resolves.toEqual({ date: "2024-03-14", time: "18:42" })
  })

  it("falls back to CreateDate when DateTimeOriginal is missing or unreadable", async () => {
    expect(await readPhotoTaken(FILE, parse({ CreateDate: "2024:03:15 09:00:00" }))).toEqual({ date: "2024-03-15", time: "09:00" })
    expect(
      await readPhotoTaken(FILE, parse({ DateTimeOriginal: "0000:00:00 00:00:00", CreateDate: "2024:03:15 09:00:00" })),
    ).toEqual({ date: "2024-03-15", time: "09:00" })
  })

  it("hands the parser only the file", async () => {
    const parser = parse(undefined)
    await readPhotoTaken(FILE, parser)
    expect(parser).toHaveBeenCalledWith(FILE)
  })

  it("gives null when the photo has neither date, or the parser fails", async () => {
    expect(await readPhotoTaken(FILE, parse(undefined))).toBeNull()
    expect(await readPhotoTaken(FILE, parse({}))).toBeNull()
    expect(await readPhotoTaken(FILE, async () => Promise.reject(new Error("bad file")))).toBeNull()
    expect(
      await readPhotoTaken(FILE, () => {
        throw new Error("sync")
      }),
    ).toBeNull()
  })
})

/**
 * A JPEG with a small EXIF block: IFD0 points at an Exif IFD with the dates given and, when asked, at a GPS IFD with
 * 34 35' 37.32" S, 58 25' 30.36" W (about -34.5937, -58.4251). Little-endian TIFF, as phones write it.
 */
function exifJpeg({ original, created, gps = false }: { original?: string; created?: string; gps?: boolean }): Blob {
  const tiff = new Uint8Array(512)
  const view = new DataView(tiff.buffer)
  let end = 8
  const reserve = (size: number) => {
    const at = end
    end += size
    return at
  }
  type Entry = [tag: number, type: number, count: number, value: number]
  const ifdSize = (entries: number) => 2 + entries * 12 + 4
  const writeIfd = (at: number, entries: Entry[]) => {
    view.setUint16(at, entries.length, true)
    entries.forEach(([tag, type, count, value], i) => {
      const entry = at + 2 + i * 12
      view.setUint16(entry, tag, true)
      view.setUint16(entry + 2, type, true)
      view.setUint32(entry + 4, count, true)
      if (type === 2 && count <= 4) tiff.set([value, 0, 0, 0], entry + 8)
      else view.setUint32(entry + 8, value, true)
    })
  }
  const ascii = (text: string) => {
    const at = reserve(text.length + 1)
    tiff.set([...text].map((c) => c.charCodeAt(0)), at)
    return at
  }
  const rationals = (parts: Array<[number, number]>) => {
    const at = reserve(parts.length * 8)
    parts.forEach(([n, d], i) => {
      view.setUint32(at + i * 8, n, true)
      view.setUint32(at + i * 8 + 4, d, true)
    })
    return at
  }

  tiff.set([0x49, 0x49, 0x2a, 0x00])
  view.setUint32(4, 8, true)
  const dates: Array<[number, string]> = []
  if (original) dates.push([0x9003, original])
  if (created) dates.push([0x9004, created])
  const ifd0 = reserve(ifdSize(gps ? 2 : 1))
  const exif = reserve(ifdSize(dates.length))
  const gpsIfd = gps ? reserve(ifdSize(4)) : 0
  writeIfd(ifd0, [[0x8769, 4, 1, exif], ...(gps ? ([[0x8825, 4, 1, gpsIfd]] as Entry[]) : [])])
  writeIfd(
    exif,
    dates.map(([tag, text]) => [tag, 2, text.length + 1, ascii(text)]),
  )
  if (gps) {
    writeIfd(gpsIfd, [
      [0x0001, 2, 2, 0x53],
      [0x0002, 5, 3, rationals([[34, 1], [35, 1], [3732, 100]])],
      [0x0003, 2, 2, 0x57],
      [0x0004, 5, 3, rationals([[58, 1], [25, 1], [3036, 100]])],
    ])
  }

  const body = tiff.slice(0, end)
  const app1Length = 2 + 6 + body.length
  const header = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, app1Length >> 8, app1Length & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0])
  return new Blob([header, body, new Uint8Array([0xff, 0xd9])], { type: "image/jpeg" })
}

describe("the real exifr parser", () => {
  it("answers the dates as the strings the camera wrote, never as Dates moved into a time zone", async () => {
    const found = await parsePhotoTimeWithExifr(exifJpeg({ original: "2024:03:14 18:42:07", created: "2024:03:14 18:42:09" }))
    expect(found).toMatchObject({ DateTimeOriginal: "2024:03:14 18:42:07", CreateDate: "2024:03:14 18:42:09" })
  })

  it("reads when a photo was taken", async () => {
    expect(await readPhotoTaken(exifJpeg({ original: "2024:03:14 18:42:07" }))).toEqual({ date: "2024-03-14", time: "18:42" })
    expect(await readPhotoTaken(exifJpeg({ created: "2023:07:04 06:05:00" }))).toEqual({ date: "2023-07-04", time: "06:05" })
  })

  it("reads the position and the time of one photo from a single parse", async () => {
    const file = exifJpeg({ original: "2024:03:14 18:42:07", gps: true })
    const before = parses.count
    const [position, taken] = await Promise.all([readPhotoGps(file as File), readPhotoTaken(file)])
    expect(position).toEqual({ lat: -34.5937, lng: -58.4251 })
    expect(taken).toEqual({ date: "2024-03-14", time: "18:42" })
    expect(parses.count - before).toBe(1)
  })

  it("gives null for a file with no EXIF", async () => {
    expect(await readPhotoTaken(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])]))).toBeNull()
  })
})
