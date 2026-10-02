import type { LocationSource } from "../photo-details"
import { roundCoordinate } from "./coordinates"
import { cleanPlaceName } from "./place-name"
import { resolveMapsLocation, type ResolveLinkDeps } from "./resolve-maps-link"

/** What a memory stores about its place: the exact position. All null, or latitude, longitude and source together. */
export interface PlaceColumns {
  latitude: number | null
  longitude: number | null
  locationSource: LocationSource | null
  placeName: string | null
  /** The street address, when the geocoder gave one. Only ever with a location. */
  placeAddress: string | null
}

export interface DecidePlaceInput {
  /** The visitor's opt-in. Only an explicit `true` counts. */
  shareLocation: unknown
  /** A Google Maps link the visitor pasted to correct the place. Re-resolved here; never trusted as coordinates. */
  mapsUrl: unknown
  /** The photo's own exact location, as the server decoded it from the EXIF; null when it has none. */
  photo: { latitude: number; longitude: number } | null
  /**
   * The place of the memory this one is contributed from, to copy as it is, when the visitor chose "Mismo lugar". The
   * caller loads it from a memory the visitor may see; the browser never sends coordinates. A link or the photo's GPS
   * (with consent) wins over it.
   */
  related?: PlaceColumns | null
}

/** The same ports the link resolver uses: the short-link follower, the geocoder and the logger. */
export type DecidePlaceDeps = ResolveLinkDeps

export const NO_PLACE: PlaceColumns = {
  latitude: null,
  longitude: null,
  locationSource: null,
  placeName: null,
  placeAddress: null,
}

/** The related memory's place, copied whole (a place that has no position is no place: nothing is copied). */
function copyOf(related: PlaceColumns | null | undefined): PlaceColumns {
  if (!related || related.latitude === null || related.longitude === null || related.locationSource === null) return NO_PLACE
  return {
    latitude: related.latitude,
    longitude: related.longitude,
    locationSource: related.locationSource,
    placeName: related.placeName,
    placeAddress: related.placeAddress,
  }
}

/**
 * The place name for a position, or null. The geocoder is a third party: it only ever receives the position rounded
 * to 2 decimals (about 1 km), whatever precision is passed in. A geocoding failure never throws: it only drops the name.
 */
export async function nameOf(
  deps: Pick<DecidePlaceDeps, "geocoder" | "log">,
  latitude: number,
  longitude: number,
): Promise<string | null> {
  try {
    return cleanPlaceName(await deps.geocoder().reverse(roundCoordinate(latitude), roundCoordinate(longitude)))
  } catch (error) {
    deps.log(`Naming a place failed (${error instanceof Error ? error.name : "unknown"}).`)
    return null
  }
}

/**
 * The server alone decides what is stored, from the consent, the link and the photo it read itself:
 *  1. no consent: nothing (and nothing is resolved or geocoded);
 *  2. a link: its re-resolved, exact position with the source `link`. A link that cannot be resolved stores no
 *     location at all; it never falls back to the photo, because the visitor said the photo's GPS was wrong;
 *  3. no link and a photo with GPS: its exact position with the source `photo`;
 *  4. otherwise the related memory's place, copied whole, when the visitor chose it (with or without the consent in 1,
 *     which is about the photo's own place); otherwise nothing.
 * Failures to name a place never remove the location: they only leave the name empty.
 */
export async function decidePlace(input: DecidePlaceInput, deps: DecidePlaceDeps): Promise<PlaceColumns> {
  const inherited = copyOf(input.related)
  if (input.shareLocation !== true) return inherited

  if (typeof input.mapsUrl === "string" && input.mapsUrl.trim() !== "") {
    const link = await resolveMapsLocation(input.mapsUrl, deps)
    if (!link.ok) return NO_PLACE
    return {
      latitude: link.lat,
      longitude: link.lng,
      locationSource: "link",
      placeName: cleanPlaceName(link.label),
      placeAddress: null,
    }
  }

  if (!input.photo) return inherited
  const { latitude, longitude } = input.photo
  return {
    latitude,
    longitude,
    locationSource: "photo",
    placeName: await nameOf(deps, latitude, longitude),
    placeAddress: null,
  }
}
