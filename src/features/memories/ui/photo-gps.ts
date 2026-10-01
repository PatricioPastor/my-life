import { exactCoordinate, isValidPosition } from "../place/coordinates"

/** What exifr's GPS reader answers: exact decimal degrees, or nothing when the photo has no GPS block. */
export type GpsParser = (file: Blob) => Promise<{ latitude: number; longitude: number } | undefined>

/**
 * Reads only the GPS block of the photo, in the browser. exifr is loaded the first time a photo is picked, so it
 * does not weigh on the initial bundle; the "lite" build reads JPEG and HEIC.
 */
export const parseGpsWithExifr: GpsParser = async (file) => {
  const exifr = await import("exifr/dist/lite.esm.mjs")
  return exifr.gps(file)
}

/**
 * The photo's position trimmed to 6 decimals (what the server stores), or null when it has no GPS, the GPS is not a
 * real position, or the file cannot be parsed. The position stays in the visitor's browser until they ask for a
 * suggestion: the server rounds it before it asks a third party for a place name.
 */
export async function readPhotoGps(
  file: Blob,
  parse: GpsParser = parseGpsWithExifr,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const found = await parse(file)
    if (!found) return null
    const lat = exactCoordinate(found.latitude)
    const lng = exactCoordinate(found.longitude)
    return isValidPosition(lat, lng) ? { lat, lng } : null
  } catch {
    return null
  }
}
