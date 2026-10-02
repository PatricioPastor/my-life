import { cleanPlaceName } from "./place-name"

/**
 * Pure parser for the Google Maps links people share. It reads the position (and the place name, when the URL
 * carries one) out of the URL text alone: no network, no logging. Short links are only recognised here; following
 * them is the job of `followShortLink`, which shares this module's host allowlists.
 *
 * Formats (assumptions: these are the documented and commonly seen shapes; Google does not publish a stable URL
 * grammar, so anything else is "no location" rather than a guess):
 *  - `...!3d<lat>!4d<lng>` in the `data=` part, the pin itself: always preferred over `@`, which is only the viewport;
 *  - `?q=<lat>,<lng>`, `?query=<lat>,<lng>` (the `api=1` search form) and `?ll=<lat>,<lng>`: also pins, in that order;
 *  - `/maps/@<lat>,<lng>,<zoom>z`, the viewport centre: the last resort, when the link carries no pin;
 *  - `/maps/place/<Name>/@<lat>,<lng>,...`, with the name URL-decoded (`+` is a space);
 *  - `maps.google.com` and country domains (`google.com.ar`, `google.co.uk`, `google.es`...).
 */

export type MapsLinkParse =
  | { kind: "location"; lat: number; lng: number; name: string | null }
  /** A short link (`maps.app.goo.gl/...`, `goo.gl/maps/...`): it has to be followed to learn the position. */
  | { kind: "short"; url: string }
  | { kind: "invalid"; reason: "not_maps_link" | "no_location" }

const NOT_MAPS: MapsLinkParse = { kind: "invalid", reason: "not_maps_link" }
const NO_LOCATION: MapsLinkParse = { kind: "invalid", reason: "no_location" }

const MAX_URL_LENGTH = 2048

/** `google.com`, `google.<cc>`, `google.com.<cc>` and `google.co.<cc>`, optionally behind `www.` or `maps.`. */
const GOOGLE_HOST = /^(?:(?:www|maps)\.)?google\.(?:com|[a-z]{2}|(?:com|co)\.[a-z]{2})$/
const SHORT_HOSTS: ReadonlySet<string> = new Set(["maps.app.goo.gl", "goo.gl"])

/** A Google host a link may point at, and a short-link redirect may land on (never anything else). */
export const isGoogleHost = (host: string): boolean => GOOGLE_HOST.test(host)
export const isShortLinkHost = (host: string): boolean => SHORT_HOSTS.has(host)

const NUMBER = String.raw`-?\d+(?:\.\d+)?`
const PIN = new RegExp(String.raw`!3d(${NUMBER})!4d(${NUMBER})`)
const VIEWPORT = new RegExp(String.raw`@(${NUMBER}),(${NUMBER})`)
const PAIR = new RegExp(String.raw`^\s*(?:loc:)?\s*(${NUMBER})\s*,\s*(${NUMBER})\s*$`)
const COORDINATES_ONLY = new RegExp(String.raw`^${NUMBER},\s*${NUMBER}$`)
const QUERY_KEYS = ["q", "query", "ll"] as const

type Candidate = readonly [string, string]

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

function validPosition(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
}

/** The `/place/<Name>/` segment, decoded; null when absent, malformed or just coordinates. */
function placeNameOf(pathname: string): string | null {
  const segment = /\/place\/([^/]+)/.exec(pathname)?.[1]
  if (!segment) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(segment.replace(/\+/g, " "))
  } catch {
    return null
  }
  const name = cleanPlaceName(decoded)
  return name && !COORDINATES_ONLY.test(name) ? name : null
}

export function parseMapsLink(input: unknown): MapsLinkParse {
  if (typeof input !== "string") return NOT_MAPS
  const raw = input.trim()
  if (raw === "" || raw.length > MAX_URL_LENGTH) return NOT_MAPS

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return NOT_MAPS
  }
  // https only, no credentials (`google.com@evil.com` tricks) and no custom port.
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return NOT_MAPS

  const host = url.hostname.toLowerCase()
  if (isShortLinkHost(host)) {
    const path = url.pathname
    const hasTarget = host === "goo.gl" ? /^\/maps(?:\/|$)/.test(path) && path.length > 6 : path.length > 1
    return hasTarget ? { kind: "short", url: url.href } : NOT_MAPS
  }

  if (!isGoogleHost(host)) return NOT_MAPS
  // maps.google.* serves Maps from its root; elsewhere only /maps is Maps (not /search, not the home page).
  if (!host.startsWith("maps.") && !/^\/maps(?:\/|$)/.test(url.pathname)) return NOT_MAPS

  const haystack = safeDecode(`${url.pathname}${url.search}${url.hash}`)
  const candidates: Candidate[] = []
  const pin = PIN.exec(haystack)
  if (pin) candidates.push([pin[1], pin[2]])
  // Then the pins the query string carries (`q`, `query`, `ll`), and only last the `@` viewport: it is where the map is
  // centred, which is near the place but is not the place.
  for (const key of QUERY_KEYS) {
    const pair = PAIR.exec(url.searchParams.get(key) ?? "")
    if (pair) candidates.push([pair[1], pair[2]])
  }
  const viewport = VIEWPORT.exec(haystack)
  if (viewport) candidates.push([viewport[1], viewport[2]])

  for (const [latText, lngText] of candidates) {
    const lat = Number(latText)
    const lng = Number(lngText)
    if (validPosition(lat, lng)) return { kind: "location", lat, lng, name: placeNameOf(url.pathname) }
  }
  return NO_LOCATION
}
