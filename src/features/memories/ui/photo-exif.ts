import type { When } from "./memory-when"

// The ambient type of exifr's lite build (src/types/exifr-lite.d.ts) only names `gps`; the form reads with `parse`.
declare module "exifr/dist/lite.esm.mjs" {
  export function parse(data: Blob, options: Record<string, unknown>): Promise<Record<string, unknown> | undefined>
}

/** What one EXIF read of a photo gives the form, raw: its GPS position and the camera's clock. */
export interface PhotoExif {
  latitude?: unknown
  longitude?: unknown
  /** When the shutter fired, as the camera wrote it: `YYYY:MM:DD HH:MM:SS`, its own wall clock, with no time zone. */
  DateTimeOriginal?: unknown
  /** When the file was made (the same moment for a phone photo; later for a scan or an edit). */
  CreateDate?: unknown
}

/** Reads when the photo was taken: exifr's answer for the two EXIF dates (a seam for tests). */
export type PhotoTimeParser = (file: Blob) => Promise<Pick<PhotoExif, "DateTimeOriginal" | "CreateDate"> | undefined>

/**
 * Only what the form reads: the GPS position and the two dates. IFD0 is read for its pointers alone (exifr follows them
 * to the Exif and GPS blocks by itself). The values are not revived: a revived date is a Date read in the browser's time
 * zone, while the camera wrote a wall clock that must stay as it is.
 */
const OPTIONS = {
  ifd0: false,
  ifd1: false,
  interop: false,
  exif: ["DateTimeOriginal", "CreateDate"],
  gps: ["GPSLatitudeRef", "GPSLatitude", "GPSLongitudeRef", "GPSLongitude"],
  reviveValues: false,
  translateValues: false,
}

const reads = new WeakMap<Blob, Promise<PhotoExif | undefined>>()

/**
 * The photo's EXIF, read once per file in the browser: the GPS reader and the time reader share this one parse. exifr is
 * loaded the first time a photo is picked, so it does not weigh on the initial bundle; the "lite" build reads JPEG and
 * HEIC.
 */
export function readExifWithExifr(file: Blob): Promise<PhotoExif | undefined> {
  let read = reads.get(file)
  if (!read) {
    read = import("exifr/dist/lite.esm.mjs").then((exifr) => exifr.parse(file, OPTIONS))
    reads.set(file, read)
  }
  return read
}

export const parsePhotoTimeWithExifr: PhotoTimeParser = (file) => readExifWithExifr(file)

const CLOCK = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?/

/**
 * The camera's wall clock (`YYYY:MM:DD HH:MM:SS`) as the form's date and time, to the minute and with no time zone, or
 * null when it is not a real moment (cameras with no clock set write `0000:00:00 00:00:00`). Only a string counts: a
 * Date would already have been moved into some time zone.
 */
export function exifClock(raw: unknown): When | null {
  if (typeof raw !== "string") return null
  const match = CLOCK.exec(raw.trim())
  if (!match) return null
  const [, year, month, day, hours, minutes] = match
  const date = `${year}-${month}-${day}`
  const check = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== date) return null
  if (Number(hours) > 23 || Number(minutes) > 59) return null
  return { date, time: `${hours}:${minutes}` }
}

/**
 * When the photo was taken, from its EXIF: `DateTimeOriginal`, else `CreateDate`, as the date and wall-clock time the
 * camera showed. Null when it has neither, or the file cannot be parsed: the form then just has no photo date.
 */
export async function readPhotoTaken(file: Blob, parse: PhotoTimeParser = parsePhotoTimeWithExifr): Promise<When | null> {
  try {
    const found = await parse(file)
    if (!found) return null
    return exifClock(found.DateTimeOriginal) ?? exifClock(found.CreateDate)
  } catch {
    return null
  }
}
