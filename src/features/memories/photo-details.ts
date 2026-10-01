/**
 * Pure mapping from what Cloudinary reports about an uploaded photo (embedded metadata and colors) to the typed,
 * sanitized value the memory stores. Nothing here touches the network, and nothing here logs.
 *
 * Privacy rules, each pinned by a test:
 *  - the metadata that is kept is a WHITELIST of non-identifying camera fields: no GPS, serial numbers, owner
 *    or author names;
 *  - the location is stored only on request (`shareLocation`) and only rounded to 2 decimals (about 1 km). The
 *    exact coordinates never leave `approximateLocation`: it is the only function that sees them.
 */

import { roundCoordinate } from "./place/coordinates"

export type MediaKind = "image"

/** Where a stored place came from. */
export type LocationSource = "photo" | "link"

// A type alias, not an interface: it must be assignable to Prisma's JSON input type.
export type PaletteColor = {
  /** Lowercase `#rrggbb`. */
  color: string
  /** Percentage of the image, as Cloudinary reports it. */
  share: number
}

export type MetadataValue = string | number

/** What the server learns about a photo and keeps. */
export interface PhotoDetails {
  kind: MediaKind
  /** Lowercase Cloudinary format name (`jpg`, `heic`...). */
  format: string
  bytes: number
  /** When the photo was taken, from EXIF; null when absent or unparseable. */
  takenAt: Date | null
  dominantColor: string | null
  palette: PaletteColor[]
  metadata: Record<string, MetadataValue>
  /** Rounded to 2 decimals; both set or both null. Only ever set with the visitor's consent. */
  approxLatitude: number | null
  approxLongitude: number | null
  /** Short label of the stored location. Set by the place decision (geocoding), never by this module. */
  placeName: string | null
  /** Set if and only if the location is. */
  locationSource: LocationSource | null
}

/** The part of Cloudinary's answer this module reads. */
export interface RawPhoto {
  format: string
  bytes: number
  imageMetadata?: Record<string, unknown>
  colors?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// --- Taken date ---------------------------------------------------------------------------------------------

const EXIF_DATE = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/
const OFFSET = /^(?:Z|([+-])(\d{2}):(\d{2}))$/i

/**
 * EXIF `DateTimeOriginal` (`YYYY:MM:DD HH:MM:SS`, local time of the camera) plus `OffsetTimeOriginal` when there
 * is one. Without an offset the camera's clock is read as UTC. An unreadable offset is ignored rather than
 * invented. Null when the date is absent, malformed, not a real calendar moment or outside 1900 to 2100.
 */
export function parseExifDate(value: unknown, offset?: unknown): Date | null {
  if (typeof value !== "string") return null
  const match = EXIF_DATE.exec(value.trim())
  if (!match) return null
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number)
  if (year < 1900 || year > 2100) return null
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  // Rejects month 13, February 30, hour 25... because the fields would roll over.
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day ||
    utc.getUTCHours() !== hour ||
    utc.getUTCMinutes() !== minute ||
    utc.getUTCSeconds() !== second
  ) {
    return null
  }
  let shiftMinutes = 0
  const parsed = typeof offset === "string" ? OFFSET.exec(offset.trim()) : null
  if (parsed?.[1]) {
    const hours = Number(parsed[2])
    const minutes = Number(parsed[3])
    if (hours <= 14 && minutes < 60) shiftMinutes = (parsed[1] === "-" ? -1 : 1) * (hours * 60 + minutes)
  }
  return new Date(utc.getTime() - shiftMinutes * 60_000)
}

// --- Approximate location -----------------------------------------------------------------------------------

type Axis = "latitude" | "longitude"
const LIMIT: Record<Axis, number> = { latitude: 90, longitude: 180 }
const POSITIVE_REF: Record<Axis, string> = { latitude: "n", longitude: "e" }
const NEGATIVE_REF: Record<Axis, string> = { latitude: "s", longitude: "w" }

/** One number: decimal, or a rational such as `4608/100`. */
function toNumber(part: unknown): number | null {
  if (typeof part === "number") return Number.isFinite(part) ? part : null
  if (typeof part !== "string") return null
  const text = part.trim()
  const fraction = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(text)
  if (fraction) {
    const denominator = Number(fraction[2])
    return denominator === 0 ? null : Number(fraction[1]) / denominator
  }
  return /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : null
}

/** A hemisphere letter from a ref field or the end of the value: `N`, `south`, `W`... or null. */
function hemisphere(text: unknown): string | null {
  if (typeof text !== "string") return null
  const first = text.trim().toLowerCase()[0]
  return first && "nsew".includes(first) && /^(?:[nsew]|north|south|east|west)$/i.test(text.trim()) ? first : null
}

/**
 * The exact value in decimal degrees, signed. Accepts decimal degrees, or degrees, minutes and seconds as an array,
 * a comma list, a rational list or ExifTool's `40 deg 42' 46.08" N`. DMS needs a hemisphere; decimals may be signed.
 */
function decimalDegrees(value: unknown, ref: unknown, axis: Axis): number | null {
  let text = typeof value === "string" ? value.trim() : value
  let inlineRef: string | null = null
  if (typeof text === "string") {
    const trailing = /\s*([NSEW])$/i.exec(text)
    if (trailing) {
      inlineRef = trailing[1].toLowerCase()
      text = text.slice(0, trailing.index)
    }
  }
  let parts: unknown[]
  if (Array.isArray(text)) parts = text
  else if (typeof text === "number") parts = [text]
  else if (typeof text === "string" && text !== "") {
    parts = text
      .replace(/deg|°/gi, " ")
      .replace(/['"′″]/g, " ")
      .split(/[\s,]+/)
      .filter(Boolean)
  } else return null
  if (parts.length < 1 || parts.length > 3) return null

  const numbers = parts.map(toNumber)
  if (numbers.some((n) => n === null)) return null
  const [degrees, minutes = 0, seconds = 0] = numbers as number[]
  const isDms = parts.length > 1

  const letter = hemisphere(ref) ?? inlineRef
  if (typeof ref === "string" && ref.trim() !== "" && hemisphere(ref) === null) return null
  if (letter && letter !== POSITIVE_REF[axis] && letter !== NEGATIVE_REF[axis]) return null
  if (isDms) {
    if (!letter || degrees < 0 || minutes < 0 || seconds < 0 || minutes >= 60 || seconds >= 60) return null
    const magnitude = degrees + minutes / 60 + seconds / 3600
    return letter === NEGATIVE_REF[axis] ? -magnitude : magnitude
  }
  if (!letter) return degrees
  // With a ref, the ref decides the sign: a value that is already negative is not negated twice.
  return letter === NEGATIVE_REF[axis] ? -Math.abs(degrees) : Math.abs(degrees)
}

/**
 * The photo's location rounded to 2 decimals (about 1 km), or null when the GPS fields are missing, malformed or
 * out of range, or are the 0,0 "no fix" position. This is the only place that holds the exact coordinates.
 */
export function approximateLocation(raw: Record<string, unknown>): { latitude: number; longitude: number } | null {
  const latitude = decimalDegrees(raw.GPSLatitude, raw.GPSLatitudeRef, "latitude")
  const longitude = decimalDegrees(raw.GPSLongitude, raw.GPSLongitudeRef, "longitude")
  if (latitude === null || longitude === null) return null
  if (Math.abs(latitude) > LIMIT.latitude || Math.abs(longitude) > LIMIT.longitude) return null
  if (latitude === 0 && longitude === 0) return null
  return { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) }
}

// --- Metadata whitelist -------------------------------------------------------------------------------------

/** Camera and shot fields that say nothing about who or where. Everything else is dropped, GPS included. */
const METADATA_WHITELIST = [
  "Make",
  "Model",
  "LensModel",
  "ISO",
  "FNumber",
  "ExposureTime",
  "FocalLength",
  "Orientation",
  "DateTimeOriginal",
  "OffsetTimeOriginal",
  "ImageWidth",
  "ImageHeight",
  "ExifImageWidth",
  "ExifImageHeight",
] as const

const MAX_VALUE_LENGTH = 100

/** Only whitelisted keys with short plain values (control characters stripped). Never throws. */
export function whitelistMetadata(raw: unknown): Record<string, MetadataValue> {
  const out: Record<string, MetadataValue> = {}
  if (!isRecord(raw)) return out
  for (const key of METADATA_WHITELIST) {
    if (!Object.hasOwn(raw, key)) continue
    const value = raw[key]
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value
    else if (typeof value === "string") {
      const clean = value.replace(/[\u0000-\u001f\u007f]/g, "").trim()
      if (clean !== "" && clean.length <= MAX_VALUE_LENGTH) out[key] = clean
    }
  }
  return out
}

// --- Colors -------------------------------------------------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i
const PALETTE_SIZE = 5

/** The usable `[hex, share]` pairs of Cloudinary's `colors`, most prominent first (the order is not trusted). */
export function paletteOf(colors: unknown): PaletteColor[] {
  if (!Array.isArray(colors)) return []
  const found: PaletteColor[] = []
  for (const entry of colors) {
    if (!Array.isArray(entry)) continue
    const [color, share] = entry
    if (typeof color !== "string" || !HEX.test(color)) continue
    if (typeof share !== "number" || !Number.isFinite(share) || share < 0) continue
    found.push({ color: color.toLowerCase(), share })
  }
  // Array#sort is stable, so equal shares keep Cloudinary's order.
  return found.sort((a, b) => b.share - a.share).slice(0, PALETTE_SIZE)
}

/** A palette read back from the database (`[{ color, share }]`), cleaned the same way. */
export function storedPaletteOf(value: unknown): PaletteColor[] {
  if (!Array.isArray(value)) return []
  return paletteOf(
    value.map((entry) => (isRecord(entry) ? [entry.color, entry.share] : null)),
  )
}

/** The most prominent color as `#rrggbb`, or null. */
export function dominantColorOf(colors: unknown): string | null {
  return paletteOf(colors)[0]?.color ?? null
}

// --- Everything together ------------------------------------------------------------------------------------

/** Maps Cloudinary's answer to the value a memory stores. `shareLocation` is the visitor's explicit opt-in. */
export function extractPhotoDetails(photo: RawPhoto, options: { shareLocation: boolean }): PhotoDetails {
  const raw = isRecord(photo.imageMetadata) ? photo.imageMetadata : {}
  const location = options.shareLocation ? approximateLocation(raw) : null
  const palette = paletteOf(photo.colors)
  return {
    kind: "image",
    format: photo.format.toLowerCase(),
    bytes: photo.bytes,
    takenAt: parseExifDate(raw.DateTimeOriginal, raw.OffsetTimeOriginal),
    dominantColor: palette[0]?.color ?? null,
    palette,
    metadata: whitelistMetadata(raw),
    approxLatitude: location?.latitude ?? null,
    approxLongitude: location?.longitude ?? null,
    placeName: null,
    locationSource: location ? "photo" : null,
  }
}
