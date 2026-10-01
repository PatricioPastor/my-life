/**
 * Coordinate helpers shared by the browser and the server.
 *
 * A memory stores the EXACT position of its photo (6 decimals, about 10 cm: the precision of the `numeric(9,6)`
 * columns), but only with the visitor's consent. Two coarser views exist on purpose:
 *  - a position rounded to 2 decimals (about 1 km) is the only thing a third party (Nominatim) ever sees;
 *  - the same 2 decimals are what the client receives in a memory's DTO, which is enough to cluster memories.
 */

const LATITUDE_LIMIT = 90
const LONGITUDE_LIMIT = 180

/** The decimals the database keeps (`numeric(9,6)`). */
export const STORED_DECIMALS = 6

/** Rounds half away from zero in decimal (so 1.005 gives 1.01 at 2 decimals), without `-0`. */
export function roundTo(value: number, decimals: number): number {
  const abs = Math.abs(value)
  // Numbers below 1e-6 print in exponent form ("1e-7"), which the decimal-string shift below cannot take.
  // Their half cases do not exist at these precisions, so plain scaling is exact enough.
  const scaled = Number.isFinite(abs) && String(abs).includes("e") ? abs * 10 ** decimals : Number(`${abs}e${decimals}`)
  const magnitude = Number(`${Math.round(scaled)}e-${decimals}`)
  return value < 0 && magnitude !== 0 ? -magnitude : magnitude
}

/** Rounds to 2 decimals (about 1 km): the precision shared with third parties and the client. */
export function roundCoordinate(value: number): number {
  return roundTo(value, 2)
}

/** Trims to the 6 decimals the database stores. */
export function exactCoordinate(value: number): number {
  return roundTo(value, STORED_DECIMALS)
}

/**
 * True for a finite position inside the globe that is not the 0,0 "no fix" position, at any precision. This is
 * what the server accepts for a stored or suggested position.
 */
export function isValidPosition(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (Math.abs(lat) > LATITUDE_LIMIT || Math.abs(lng) > LONGITUDE_LIMIT) return false
  return !(lat === 0 && lng === 0)
}

/**
 * True for a valid position already rounded to 2 decimals. The geocoder demands this, so the exact position of a
 * photo can never reach a third party by accident: anything more precise is refused, not trimmed.
 */
export function isApproximatePosition(lat: unknown, lng: unknown): boolean {
  return (
    isValidPosition(lat, lng) && roundCoordinate(lat as number) === lat && roundCoordinate(lng as number) === lng
  )
}
