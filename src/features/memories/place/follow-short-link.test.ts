import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { MAX_REDIRECT_HOPS, followShortLink } from "./follow-short-link"

const FINAL = "https://www.google.com/maps/place/Plaza+Italia/@-34.581,-58.4208,17z"

/** A response that records every way its body could be read: none of them may ever be used. */
function redirect(location: string | null, status = 302) {
  const body = { cancel: vi.fn(async () => undefined) }
  const response = {
    status,
    ok: false,
    headers: new Headers(location === null ? {} : { location }),
    body,
    text: vi.fn(),
    json: vi.fn(),
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
  }
  return response
}

const chain = (...responses: Array<ReturnType<typeof redirect>>) => {
  const fetch = vi.fn<typeof globalThis.fetch>()
  for (const response of responses) fetch.mockResolvedValueOnce(response as unknown as Response)
  return fetch
}

describe("followShortLink", () => {
  it("follows one redirect to the final Google Maps URL and never fetches that URL", async () => {
    const fetch = chain(redirect(FINAL))
    expect(await followShortLink("https://maps.app.goo.gl/AbCd", { fetch })).toEqual({ ok: true, url: FINAL })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(fetch.mock.calls[0][0])).toBe("https://maps.app.goo.gl/AbCd")
  })

  it("follows a chain of allowed short hops", async () => {
    const fetch = chain(redirect("https://goo.gl/maps/Zz9"), redirect(FINAL))
    expect(await followShortLink("https://maps.app.goo.gl/AbCd", { fetch })).toEqual({ ok: true, url: FINAL })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("keeps going through an allowed Google page that is not readable yet", async () => {
    const fetch = chain(redirect("https://www.google.com/maps/place/Plaza+Italia"), redirect(FINAL))
    expect(await followShortLink("https://maps.app.goo.gl/AbCd", { fetch })).toEqual({ ok: true, url: FINAL })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("resolves a relative Location against the current URL", async () => {
    const fetch = chain(redirect("https://www.google.com/maps/place/Foo"), redirect("/maps/@-34.581,-58.4208,17z"))
    expect(await followShortLink("https://goo.gl/maps/AbCd", { fetch })).toEqual({
      ok: true,
      url: "https://www.google.com/maps/@-34.581,-58.4208,17z",
    })
  })

  it("fetches at most 3 hops, then gives up", async () => {
    expect(MAX_REDIRECT_HOPS).toBe(3)
    const fetch = vi.fn(async () => redirect("https://goo.gl/maps/again") as unknown as Response)
    expect(await followShortLink("https://maps.app.goo.gl/AbCd", { fetch })).toEqual({
      ok: false,
      reason: "too_many_redirects",
    })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it.each([
    ["another host", "https://evil.example/maps"],
    ["a look-alike Google host", "https://www.google.com.evil.example/maps/@1.5,2.5,3z"],
    ["plain http", "http://www.google.com/maps/@1.5,2.5,3z"],
    ["an internal address", "http://169.254.169.254/latest/meta-data"],
    ["localhost", "https://localhost/maps"],
    ["a custom port", "https://www.google.com:8080/maps/@1.5,2.5,3z"],
    ["a URL with userinfo", "https://user:pw@www.google.com/maps/@1.5,2.5,3z"],
    ["another scheme", "file:///etc/passwd"],
  ])("refuses a redirect to %s and never fetches it", async (_label, target) => {
    const fetch = chain(redirect(target))
    expect(await followShortLink("https://maps.app.goo.gl/AbCd", { fetch })).toEqual({
      ok: false,
      reason: "disallowed_host",
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("refuses to start from a host that is not allowed, fetching nothing", async () => {
    const fetch = chain()
    expect(await followShortLink("https://evil.example/x", { fetch })).toEqual({ ok: false, reason: "disallowed_host" })
    expect(await followShortLink("not a url", { fetch })).toEqual({ ok: false, reason: "disallowed_host" })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("does not follow redirects by itself, sends no cookies and has a timeout", async () => {
    const fetch = chain(redirect(FINAL))
    await followShortLink("https://maps.app.goo.gl/AbCd", { fetch })
    const init = fetch.mock.calls[0][1]!
    expect(init.redirect).toBe("manual")
    expect(init.credentials).toBe("omit")
    expect(init.method).toBe("GET")
    expect(init.signal).toBeInstanceOf(AbortSignal)
    const headers = new Headers(init.headers)
    expect(headers.has("cookie")).toBe(false)
    expect(headers.has("authorization")).toBe(false)
  })

  it("reads only the Location header: the body is released, never read", async () => {
    const response = redirect(FINAL)
    await followShortLink("https://maps.app.goo.gl/AbCd", { fetch: chain(response) })
    expect(response.body.cancel).toHaveBeenCalled()
    for (const read of [response.text, response.json, response.arrayBuffer, response.blob, response.formData]) {
      expect(read).not.toHaveBeenCalled()
    }
  })

  it.each([
    ["a 200 answer", redirect(null, 200)],
    ["a redirect with no Location", redirect(null, 302)],
    ["a 404", redirect(null, 404)],
  ])("gives no_redirect for %s", async (_label, response) => {
    expect(await followShortLink("https://maps.app.goo.gl/AbCd", { fetch: chain(response) })).toEqual({
      ok: false,
      reason: "no_redirect",
    })
  })

  it("gives network when fetch fails, and when it times out", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("fetch failed")
    })
    expect(await followShortLink("https://maps.app.goo.gl/AbCd", { fetch: failing as never })).toEqual({
      ok: false,
      reason: "network",
    })

    const hanging = vi.fn(
      (_url: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "TimeoutError")))
        }),
    )
    expect(await followShortLink("https://maps.app.goo.gl/AbCd", { fetch: hanging as never, timeoutMs: 5 })).toEqual({
      ok: false,
      reason: "network",
    })
  })
})
