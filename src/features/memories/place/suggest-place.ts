import { isValidPosition, roundCoordinate } from "./coordinates"
import type { ReverseGeocoder } from "./reverse-geocoder"

export interface SuggestPlaceDeps {
  currentVisitor: () => Promise<{ handle: string } | null>
  /** Lazy, so building it happens inside the failure handling. */
  geocoder: () => ReverseGeocoder
  /** One short line, never with coordinates or personal data. */
  log: (message: string) => void
}

export type SuggestPlaceResult =
  | { ok: true; label: string | null }
  | { ok: false; reason: "no_session" | "invalid" }

/**
 * Names the place of a position. It needs a session and refuses anything that is not a real position (outside the
 * globe, the 0,0 no-fix point, not a number). The browser may send the photo's exact position, but the geocoder is
 * a third party: it is only ever asked about the position rounded to 2 decimals. It never fails because of the
 * geocoder: no label is `{ ok: true, label: null }` and the form shows the coordinates instead.
 */
export async function suggestPlaceWith(deps: SuggestPlaceDeps, input: unknown): Promise<SuggestPlaceResult> {
  const visitor = await deps.currentVisitor()
  if (!visitor) return { ok: false, reason: "no_session" }

  const { lat, lng } = (typeof input === "object" && input !== null ? input : {}) as { lat?: unknown; lng?: unknown }
  if (!isValidPosition(lat, lng)) return { ok: false, reason: "invalid" }
  const rounded = { lat: roundCoordinate(lat as number), lng: roundCoordinate(lng as number) }
  // A position that only rounds to the 0,0 no-fix point has nothing to name.
  if (!isValidPosition(rounded.lat, rounded.lng)) return { ok: false, reason: "invalid" }

  try {
    return { ok: true, label: await deps.geocoder().reverse(rounded.lat, rounded.lng) }
  } catch (error) {
    deps.log(`Suggesting a place failed (${error instanceof Error ? error.name : "unknown"}).`)
    return { ok: true, label: null }
  }
}
