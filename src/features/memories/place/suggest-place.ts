import { exactCoordinate, isValidPosition } from "./coordinates"
import type { ReverseGeocoder } from "./reverse-geocoder"

export interface SuggestPlaceDeps {
  currentVisitor: () => Promise<{ handle: string } | null>
  /** Lazy, so building it happens inside the failure handling. */
  geocoder: () => ReverseGeocoder
  /** One short line, never with coordinates or personal data. */
  log: (message: string) => void
}

export type SuggestPlaceResult =
  | { ok: true; label: string | null; address: string | null }
  | { ok: false; reason: "no_session" | "invalid" }

/**
 * Names the place of a position and finds its street address. It needs a session and refuses anything that is not a
 * real position (outside the globe, the 0,0 no-fix point, not a number). The browser sends the photo's exact position
 * and the geocoder is asked about exactly it (to the 6 decimals the database keeps): the address needs it, and nothing
 * is stored unless the visitor then consents. It never fails because of the geocoder: no answer is
 * `{ ok: true, label: null, address: null }` and the form shows the coordinates instead.
 */
export async function suggestPlaceWith(deps: SuggestPlaceDeps, input: unknown): Promise<SuggestPlaceResult> {
  const visitor = await deps.currentVisitor()
  if (!visitor) return { ok: false, reason: "no_session" }

  const { lat, lng } = (typeof input === "object" && input !== null ? input : {}) as { lat?: unknown; lng?: unknown }
  if (!isValidPosition(lat, lng)) return { ok: false, reason: "invalid" }
  const exact = { lat: exactCoordinate(lat as number), lng: exactCoordinate(lng as number) }
  // A position that only trims to the 0,0 no-fix point has nothing to name.
  if (!isValidPosition(exact.lat, exact.lng)) return { ok: false, reason: "invalid" }

  try {
    const described = await deps.geocoder().reverse(exact.lat, exact.lng)
    return { ok: true, label: described?.label ?? null, address: described?.address ?? null }
  } catch (error) {
    deps.log(`Suggesting a place failed (${error instanceof Error ? error.name : "unknown"}).`)
    return { ok: true, label: null, address: null }
  }
}
