import { exactCoordinate, isValidPosition } from "./coordinates"
import type { FollowResult } from "./follow-short-link"
import { parseMapsLink, type MapsLinkParse } from "./maps-link"
import { cleanPlaceAddress, cleanPlaceName } from "./place-name"
import type { ReverseGeocoder } from "./reverse-geocoder"

export interface ResolveLinkDeps {
  /** Follows a short link on the server (the SSRF-guarded follower). Never called for a full URL. */
  follow: (url: string) => Promise<FollowResult>
  /** Lazy: only built when a nameless position needs a label. */
  geocoder: () => ReverseGeocoder
  /** One short line, never with the link or coordinates. */
  log: (message: string) => void
}

export type ResolveLinkFailure = "not_maps_link" | "unreadable"

/**
 * The exact position (6 decimals) of the pin, with a short label (the place name from the URL, else a geocoded one) and
 * the street address of that position, when it has one.
 */
export type ResolvedLink = { ok: true; lat: number; lng: number; label: string | null; address: string | null }

const failed = (reason: ResolveLinkFailure) => ({ ok: false, reason }) as const

/**
 * Trims the position to the stored precision and describes it: the label is the URL's own place name (it stays the name,
 * for example "UOCRA"), else the geocoded one; the street address always comes from reverse geocoding the exact pin
 * (never fatal: without it the place just has no address).
 */
async function located(
  parsed: Extract<MapsLinkParse, { kind: "location" }>,
  deps: ResolveLinkDeps,
): Promise<ResolvedLink | { ok: false; reason: ResolveLinkFailure }> {
  const lat = exactCoordinate(parsed.lat)
  const lng = exactCoordinate(parsed.lng)
  if (!isValidPosition(lat, lng)) return failed("unreadable")

  let geocoded: { label: string | null; address: string | null } = { label: null, address: null }
  try {
    const found = await deps.geocoder().reverse(lat, lng)
    geocoded = { label: cleanPlaceName(found?.label), address: cleanPlaceAddress(found?.address) }
  } catch (error) {
    deps.log(`Naming a linked place failed (${error instanceof Error ? error.name : "unknown"}).`)
  }
  return { ok: true, lat, lng, label: cleanPlaceName(parsed.name) ?? geocoded.label, address: geocoded.address }
}

/**
 * Turns a pasted Google Maps link into an exact position and a label. Used by the visitor-facing action and, again,
 * by `createMemory`, which never trusts what the browser resolved. Never throws.
 */
export async function resolveMapsLocation(
  input: unknown,
  deps: ResolveLinkDeps,
): Promise<ResolvedLink | { ok: false; reason: ResolveLinkFailure }> {
  try {
    const parsed = parseMapsLink(input)
    if (parsed.kind === "invalid") return failed(parsed.reason === "no_location" ? "unreadable" : "not_maps_link")
    if (parsed.kind === "location") return await located(parsed, deps)

    const followed = await deps.follow(parsed.url)
    if (!followed.ok) return failed(followed.reason === "disallowed_host" ? "not_maps_link" : "unreadable")
    const final = parseMapsLink(followed.url)
    return final.kind === "location" ? await located(final, deps) : failed("unreadable")
  } catch (error) {
    deps.log(`Resolving a Maps link failed (${error instanceof Error ? error.name : "unknown"}).`)
    return failed("unreadable")
  }
}

export interface ResolveMapsLinkDeps extends ResolveLinkDeps {
  currentVisitor: () => Promise<{ handle: string } | null>
}

export type ResolveMapsLinkResult = ResolvedLink | { ok: false; reason: "no_session" | ResolveLinkFailure }

/** The server action behind the form's link input: needs a session, takes `{ url }`, returns the exact place. */
export async function resolveMapsLinkWith(deps: ResolveMapsLinkDeps, input: unknown): Promise<ResolveMapsLinkResult> {
  const visitor = await deps.currentVisitor()
  if (!visitor) return { ok: false, reason: "no_session" }
  const url = typeof input === "object" && input !== null ? (input as { url?: unknown }).url : undefined
  return resolveMapsLocation(typeof url === "string" ? url : null, deps)
}
