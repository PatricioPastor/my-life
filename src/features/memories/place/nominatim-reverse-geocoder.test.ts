import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { NOMINATIM_CACHE_LIMIT, NominatimReverseGeocoder, buildUserAgent } from "./nominatim-reverse-geocoder"

const ok = (address: Record<string, string>) =>
  new Response(JSON.stringify({ address }), { status: 200, headers: { "content-type": "application/json" } })

const STREET = { road: "Avenida Rivadavia", house_number: "1234", suburb: "Palermo", city: "Buenos Aires", country: "Argentina" }

function setup(over: Partial<ConstructorParameters<typeof NominatimReverseGeocoder>[0]> = {}) {
  const fetch = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(async () => ok(STREET))
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined)
  let clock = 1_000_000
  const geocoder = new NominatimReverseGeocoder({
    fetch: fetch as unknown as typeof globalThis.fetch,
    userAgent: "my-life/1.0 (https://example.com; contact: https://ig.me/m/owner)",
    now: () => clock,
    sleep,
    ...over,
  })
  return { geocoder, fetch, sleep, advance: (ms: number) => (clock += ms) }
}

describe("buildUserAgent", () => {
  it("identifies the app with the site URL and the owner contact", () => {
    expect(buildUserAgent("https://my-life.example", "https://ig.me/m/owner")).toBe(
      "my-life/1.0 (+https://my-life.example; contact: https://ig.me/m/owner)",
    )
  })
})

describe("NominatimReverseGeocoder", () => {
  it("asks the reverse endpoint for a street-level answer in Spanish, with an identifying User-Agent", async () => {
    const { geocoder, fetch } = setup()
    await geocoder.reverse(-34.593712, -58.421589)

    const [url, init] = fetch.mock.calls[0]
    const parsed = new URL(String(url))
    expect(parsed.origin + parsed.pathname).toBe("https://nominatim.openstreetmap.org/reverse")
    expect(Object.fromEntries(parsed.searchParams)).toMatchObject({
      format: "jsonv2",
      zoom: "18",
      addressdetails: "1",
      "accept-language": "es",
    })
    const headers = new Headers(init?.headers)
    expect(headers.get("user-agent")).toContain("my-life/1.0")
    expect(headers.get("user-agent")).toContain("https://ig.me/m/owner")
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.redirect).toBe("error")
  })

  it("sends the exact position, to 6 decimals, not a rounded one", async () => {
    const { geocoder, fetch } = setup()
    await geocoder.reverse(-34.593712, -58.421589)
    const parsed = new URL(String(fetch.mock.calls[0][0]))
    expect(parsed.searchParams.get("lat")).toBe("-34.593712")
    expect(parsed.searchParams.get("lon")).toBe("-58.421589")
  })

  it("answers with the place name and the street address", async () => {
    const { geocoder } = setup()
    expect(await geocoder.reverse(-34.593712, -58.421589)).toEqual({
      label: "Palermo, Buenos Aires",
      address: "Av. Rivadavia 1234, Buenos Aires",
    })
  })

  it("has no address when the answer names no street", async () => {
    const { geocoder } = setup({ fetch: (async () => ok({ suburb: "Palermo", city: "Buenos Aires" })) as never })
    expect(await geocoder.reverse(-34.59, -58.42)).toEqual({ label: "Palermo, Buenos Aires", address: null })
  })

  it("gives null when the answer has nothing usable, an error field, or is not JSON", async () => {
    for (const body of [{ error: "Unable to geocode" }, {}, { address: {} }, "nope"]) {
      const { geocoder } = setup({
        fetch: (async () => new Response(typeof body === "string" ? body : JSON.stringify(body))) as never,
      })
      expect(await geocoder.reverse(1.5, 2.5)).toBeNull()
    }
  })

  it("gives null on an HTTP error, a network failure or a timeout, and never throws", async () => {
    const failures = [
      async () => new Response("busy", { status: 429 }),
      async () => {
        throw new TypeError("fetch failed")
      },
      async (_u: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "TimeoutError")))
        }),
    ]
    for (const fail of failures) {
      const { geocoder } = setup({ fetch: fail as never, timeoutMs: 5 })
      expect(await geocoder.reverse(1.5, 2.5)).toBeNull()
    }
  })

  it("caches successful answers by exact position and does not call again", async () => {
    const { geocoder, fetch } = setup()
    await geocoder.reverse(-34.593712, -58.421589)
    await geocoder.reverse(-34.593712, -58.421589)
    expect(fetch).toHaveBeenCalledTimes(1)
    // The next door down is another address: it is another lookup.
    await geocoder.reverse(-34.593812, -58.421589)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("does not cache failures, so a transient problem is retried", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("down"))
      .mockResolvedValueOnce(ok({ city: "Montevideo", country: "Uruguay" }))
    const { geocoder } = setup({ fetch: fetch as never })
    expect(await geocoder.reverse(-34.9, -56.16)).toBeNull()
    expect(await geocoder.reverse(-34.9, -56.16)).toEqual({ label: "Montevideo, Uruguay", address: null })
  })

  it("keeps the cache bounded", async () => {
    const { geocoder, fetch } = setup()
    for (let i = 0; i < NOMINATIM_CACHE_LIMIT + 5; i++) await geocoder.reverse(Number((10 + i * 0.01).toFixed(2)), 20)
    fetch.mockClear()
    await geocoder.reverse(10, 20) // the oldest position was evicted
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("spaces requests at least a second apart (the public service allows one per second)", async () => {
    const { geocoder, sleep, advance } = setup()
    await geocoder.reverse(1.01, 1)
    advance(300)
    await geocoder.reverse(2.01, 1)
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(700)
    advance(5000)
    await geocoder.reverse(3.01, 1)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it("rejects a position that is not on the globe without calling out", async () => {
    const { geocoder, fetch } = setup()
    expect(await geocoder.reverse(100, 0)).toBeNull()
    expect(await geocoder.reverse(0, 0)).toBeNull()
    expect(await geocoder.reverse(Number.NaN, 1)).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})
