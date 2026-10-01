/**
 * Coordinate helpers shared by the browser and the server. Everything that is stored or sent over the wire is
 * rounded to 2 decimals (about 1 km): the exact position of a photo never leaves the place that read it.
 */

const LATITUDE_LIMIT = 90
const LONGITUDE_LIMIT = 180

/** Rounds to 2 decimals half away from zero, in decimal (so 1.005 gives 1.01), without `-0`. */
export function roundCoordinate(value: number): number {
  const magnitude = Number(`${Math.round(Number(`${Math.abs(value)}e2`))}e-2`)
  return value < 0 && magnitude !== 0 ? -magnitude : magnitude
}

/**
 * True for a finite position inside the globe, already rounded to 2 decimals, that is not the 0,0 "no fix"
 * position. This is what the server accepts from the browser: anything more precise is refused, not trimmed.
 */
export function isApproximatePosition(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (Math.abs(lat) > LATITUDE_LIMIT || Math.abs(lng) > LONGITUDE_LIMIT) return false
  if (lat === 0 && lng === 0) return false
  return roundCoordinate(lat) === lat && roundCoordinate(lng) === lng
}
