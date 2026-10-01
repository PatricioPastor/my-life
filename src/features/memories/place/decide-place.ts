import type { LocationSource } from "../photo-details"
import { cleanPlaceName } from "./place-name"
import { resolveMapsLocation, type ResolveLinkDeps } from "./resolve-maps-link"

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
  /** A Google Maps link the visitor pasted to correct the place. Re-resolved here; never trusted as coordinates. */
  mapsUrl: unknown
  /** The photo's own location, already rounded to 2 decimals on the server; null when it has none. */
  photo: { latitude: number; longitude: number } | null
}

/** The same ports the link resolver uses: the short-link follower, the geocoder and the logger. */
export type DecidePlaceDeps = ResolveLinkDeps

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
 * The server alone decides what is stored, from the consent, the link and the photo it read itself:
 *  1. no consent: nothing (and nothing is resolved or geocoded);
 *  2. a link: its re-resolved, rounded position with the source `link`. A link that cannot be resolved stores no
 *     location at all; it never falls back to the photo, because the visitor said the photo's GPS was wrong;
 *  3. no link and a photo with GPS: its rounded position with the source `photo`;
 *  4. otherwise nothing.
 * Failures to name a place never remove the location: they only leave the name empty.
 */
export async function decidePlace(input: DecidePlaceInput, deps: DecidePlaceDeps): Promise<PlaceColumns> {
  if (input.shareLocation !== true) return NO_PLACE

  if (typeof input.mapsUrl === "string" && input.mapsUrl.trim() !== "") {
    const link = await resolveMapsLocation(input.mapsUrl, deps)
    if (!link.ok) return NO_PLACE
    return {
      approxLatitude: link.lat,
      approxLongitude: link.lng,
      locationSource: "link",
      placeName: cleanPlaceName(link.label),
    }
  }

  if (!input.photo) return NO_PLACE
  const { latitude, longitude } = input.photo
  return {
    approxLatitude: latitude,
    approxLongitude: longitude,
    locationSource: "photo",
    placeName: await nameOf(deps, latitude, longitude),
  }
}
