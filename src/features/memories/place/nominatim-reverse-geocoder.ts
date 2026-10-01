import "server-only"
import { isApproximatePosition } from "./coordinates"
import { composePlaceLabel, type AddressParts, type ReverseGeocoder } from "./reverse-geocoder"

/**
 * Reverse geocoding through the public Nominatim service (OpenStreetMap).
 *
 * Usage policy constraints this adapter honours (https://operations.osmfoundation.org/policies/nominatim/):
 *  - an identifying `User-Agent` (the app, the site and a contact), never a library default;
 *  - at most one request per second (a minimum gap between outgoing calls);
 *  - results are cached, and only ever for positions rounded to 2 decimals, so repeated cells cost nothing;
 *  - no bulk use: one lookup per photo the visitor picks.
 * The `zoom=14` level asks for neighbourhood detail, which is all the label needs.
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
  private readonly cache = new Map<string, string>()
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

  async reverse(lat: number, lng: number): Promise<string | null> {
    // Only rounded positions are ever looked up: the exact location of a photo never reaches a third party.
    if (!isApproximatePosition(lat, lng)) return null
    const key = `${lat},${lng}`
    const cached = this.cache.get(key)
    if (cached !== undefined) return cached

    try {
      const wait = this.lastRequestAt + MIN_INTERVAL_MS - this.now()
      if (wait > 0) await this.sleep(wait)
      this.lastRequestAt = this.now()

      const url = new URL(ENDPOINT)
      url.search = new URLSearchParams({
        format: "jsonv2",
        zoom: "14",
        addressdetails: "1",
        "accept-language": "es",
        lat: String(lat),
        lon: String(lng),
      }).toString()

      const response = await this.fetchImpl(url, {
        headers: { "User-Agent": this.options.userAgent, Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (!response.ok) return null
      const body = (await response.json()) as { address?: AddressParts } | null
      const label = composePlaceLabel(body?.address)
      if (label) this.remember(key, label)
      return label
    } catch {
      return null
    }
  }

  private remember(key: string, label: string) {
    this.cache.set(key, label)
    if (this.cache.size > NOMINATIM_CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
  }
}
