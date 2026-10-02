import "server-only"
import { exactCoordinate, isValidPosition } from "./coordinates"
import { describePlace, type AddressParts, type PlaceDescription, type ReverseGeocoder } from "./reverse-geocoder"

/**
 * Reverse geocoding through the public Nominatim service (OpenStreetMap).
 *
 * Usage policy constraints this adapter honours (https://operations.osmfoundation.org/policies/nominatim/):
 *  - an identifying `User-Agent` (the app, the site and a contact), never a library default;
 *  - at most one request per second (a minimum gap between outgoing calls);
 *  - results are cached by exact position, so the same spot (a photo and its Maps link, a retry) costs one request;
 *  - no bulk use: one lookup per photo (or pasted link) the visitor picks.
 * The position is the exact one (6 decimals): the visitor consents to keeping the exact place and its address, and a
 * street address needs it. `zoom=18` asks for street-level detail (the road and the house number).
 */

const ENDPOINT = "https://nominatim.openstreetmap.org/reverse"
const DEFAULT_TIMEOUT_MS = 3000
const MIN_INTERVAL_MS = 1000

/** Cached cells before the oldest is dropped. */
export const NOMINATIM_CACHE_LIMIT = 500

export interface NominatimOptions {
  fetch?: typeof globalThis.fetch
  userAgent: string
  timeoutMs?: number
  /** Milliseconds, like `Date.now`. */
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/** `my-life/1.0 (+<site>; contact: <owner contact>)`: enough for the operators to reach us. */
export function buildUserAgent(siteUrl: string, contact: string): string {
  return `my-life/1.0 (+${siteUrl}; contact: ${contact})`
}

export class NominatimReverseGeocoder implements ReverseGeocoder {
  private readonly cache = new Map<string, PlaceDescription>()
  private lastRequestAt = Number.NEGATIVE_INFINITY
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly timeoutMs: number

  constructor(private readonly options: NominatimOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async reverse(lat: number, lng: number): Promise<PlaceDescription | null> {
    if (!isValidPosition(lat, lng)) return null
    // The stored precision: more decimals than the database keeps would only split the cache.
    const exactLat = exactCoordinate(lat)
    const exactLng = exactCoordinate(lng)
    const key = `${exactLat},${exactLng}`
    const cached = this.cache.get(key)
    if (cached !== undefined) return cached

    try {
      const wait = this.lastRequestAt + MIN_INTERVAL_MS - this.now()
      if (wait > 0) await this.sleep(wait)
      this.lastRequestAt = this.now()

      const url = new URL(ENDPOINT)
      url.search = new URLSearchParams({
        format: "jsonv2",
        zoom: "18",
        addressdetails: "1",
        "accept-language": "es",
        lat: String(exactLat),
        lon: String(exactLng),
      }).toString()

      const response = await this.fetchImpl(url, {
        headers: { "User-Agent": this.options.userAgent, Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (!response.ok) return null
      const body = (await response.json()) as { address?: AddressParts } | null
      const description = describePlace(body?.address)
      if (description) this.remember(key, description)
      return description
    } catch {
      return null
    }
  }

  private remember(key: string, description: PlaceDescription) {
    this.cache.set(key, description)
    if (this.cache.size > NOMINATIM_CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
  }
}
