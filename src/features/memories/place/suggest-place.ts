import { isApproximatePosition } from "./coordinates"
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
 * Names the place of a rounded position (the browser rounds before anything is sent). It needs a session, refuses
 * anything outside the globe or more precise than 2 decimals, and never fails because of the geocoder: no label is
 * `{ ok: true, label: null }` and the form shows the coordinates instead.
 */
export async function suggestPlaceWith(deps: SuggestPlaceDeps, input: unknown): Promise<SuggestPlaceResult> {
  const visitor = await deps.currentVisitor()
  if (!visitor) return { ok: false, reason: "no_session" }

  const { lat, lng } = (typeof input === "object" && input !== null ? input : {}) as { lat?: unknown; lng?: unknown }
  if (!isApproximatePosition(lat, lng)) return { ok: false, reason: "invalid" }

  try {
    return { ok: true, label: await deps.geocoder().reverse(lat as number, lng as number) }
  } catch (error) {
    deps.log(`Suggesting a place failed (${error instanceof Error ? error.name : "unknown"}).`)
    return { ok: true, label: null }
  }
}
