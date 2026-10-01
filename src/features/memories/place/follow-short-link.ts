import "server-only"
import { isGoogleHost, isShortLinkHost, parseMapsLink } from "./maps-link"

/**
 * Follows a Google short link (`maps.app.goo.gl/...`, `goo.gl/maps/...`) to the URL it points at, on the server.
 *
 * SSRF guard, each rule pinned by a test:
 *  - redirects are never followed by `fetch` itself (`redirect: "manual"`): every hop is read by us;
 *  - a URL is fetched only if it is https, has no credentials or custom port, and its host is on the allowlist
 *    (the short-link hosts and Google's own domains). The first URL is checked too, and a redirect target is
 *    checked BEFORE it is ever requested, so no other host (internal addresses included) is ever contacted;
 *  - at most 3 hops, each with a short timeout, and no cookies or credentials are sent;
 *  - only the `Location` header is read: the body is released unread (`body.cancel()`), never parsed.
 */

export const MAX_REDIRECT_HOPS = 3
const DEFAULT_TIMEOUT_MS = 3000
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308])

export type FollowResult =
  | { ok: true; url: string }
  | { ok: false; reason: "disallowed_host" | "too_many_redirects" | "no_redirect" | "network" }

export interface FollowOptions {
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}

function fetchable(url: URL): boolean {
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return false
  const host = url.hostname.toLowerCase()
  return isShortLinkHost(host) || isGoogleHost(host)
}

/**
 * Resolves a short link. Returns as soon as a hop lands on a URL with a readable position (that last URL is never
 * requested); keeps going through allowed short or Google pages that do not carry one yet, up to 3 fetches.
 */
export async function followShortLink(start: string, options: FollowOptions = {}): Promise<FollowResult> {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let current: URL
  try {
    current = new URL(start)
  } catch {
    return { ok: false, reason: "disallowed_host" }
  }

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    if (!fetchable(current)) return { ok: false, reason: "disallowed_host" }

    let response: Response
    try {
      response = await fetchImpl(current.href, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        headers: { Accept: "text/html,*/*;q=0.1" },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch {
      return { ok: false, reason: "network" }
    }

    // Release the connection without reading anything: only the Location header matters.
    void Promise.resolve(response.body?.cancel()).catch(() => undefined)

    const location = REDIRECT_STATUSES.has(response.status) ? response.headers.get("location") : null
    if (!location) return { ok: false, reason: "no_redirect" }

    let next: URL
    try {
      next = new URL(location, current)
    } catch {
      return { ok: false, reason: "disallowed_host" }
    }
    // Checked before it is ever requested, and before it is handed back.
    if (!fetchable(next)) return { ok: false, reason: "disallowed_host" }
    if (parseMapsLink(next.href).kind === "location") return { ok: true, url: next.href }
    current = next
  }
  return { ok: false, reason: "too_many_redirects" }
}
