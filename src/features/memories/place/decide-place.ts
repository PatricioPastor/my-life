import type { LocationSource } from "../photo-details"
import { cleanPlaceName } from "./place-name"
import type { ReverseGeocoder } from "./reverse-geocoder"

/** What a memory stores about its place. All null, or latitude, longitude and source together. */
export interface PlaceColumns {
  approxLatitude: number | null
  approxLongitude: number | null
  locationSource: LocationSource | null
  placeName: string | null
}

export interface DecidePlaceInput {
  /** The visitor's opt-in. Only an explicit `true` counts. */
  shareLocation: unknown
  /** The photo's own location, already rounded to 2 decimals on the server; null when it has none. */
  photo: { latitude: number; longitude: number } | null
}

export interface DecidePlaceDeps {
  /** Lazy: nothing is built, and nothing is called, unless a name is needed. */
  geocoder: () => ReverseGeocoder
  /** One short line, never with coordinates or personal data. */
  log: (message: string) => void
}

export const NO_PLACE: PlaceColumns = {
  approxLatitude: null,
  approxLongitude: null,
  locationSource: null,
  placeName: null,
}

/** The place name for a rounded position, or null. A geocoding failure never throws: it only drops the name. */
export async function nameOf(
  deps: Pick<DecidePlaceDeps, "geocoder" | "log">,
  latitude: number,
  longitude: number,
): Promise<string | null> {
  try {
    return cleanPlaceName(await deps.geocoder().reverse(latitude, longitude))
  } catch (error) {
    deps.log(`Naming a place failed (${error instanceof Error ? error.name : "unknown"}).`)
    return null
  }
}

/**
 * The server alone decides what is stored. With consent and a photo that has GPS, the rounded photo position is
 * stored with the source `photo` and its geocoded name. Otherwise nothing is. Failures to name the place never
 * remove the location: they only leave the name empty.
 */
export async function decidePlace(input: DecidePlaceInput, deps: DecidePlaceDeps): Promise<PlaceColumns> {
  if (input.shareLocation !== true || !input.photo) return NO_PLACE
  const { latitude, longitude } = input.photo
  return {
    approxLatitude: latitude,
    approxLongitude: longitude,
    locationSource: "photo",
    placeName: await nameOf(deps, latitude, longitude),
  }
}
