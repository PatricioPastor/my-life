import "server-only"
import { OWNER_CONTACT_URL } from "@/shared/site/owner"
import { resolveSiteUrl } from "@/shared/site/site-url"
import { NominatimReverseGeocoder, buildUserAgent } from "./nominatim-reverse-geocoder"
import type { ReverseGeocoder } from "./reverse-geocoder"

let shared: ReverseGeocoder | undefined

/**
 * The reverse geocoder the server actions use: Nominatim, identified by the site URL and the owner contact.
 * One instance per server process, so its in-memory cache and its one-request-per-second spacing are shared.
 */
export function getReverseGeocoder(): ReverseGeocoder {
  shared ??= new NominatimReverseGeocoder({
    userAgent: buildUserAgent(resolveSiteUrl(process.env), OWNER_CONTACT_URL),
  })
  return shared
}
