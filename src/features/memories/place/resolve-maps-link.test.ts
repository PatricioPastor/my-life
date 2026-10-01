import { describe, expect, it, vi } from "vitest"
import { resolveMapsLinkWith, resolveMapsLocation, type ResolveLinkDeps } from "./resolve-maps-link"

const FULL = "https://www.google.com/maps/place/Plaza+Italia/@-34.5810,-58.4208,17z/data=!3d-34.58123!4d-58.42087"

function make(over: Partial<ResolveLinkDeps> = {}) {
  const reverse = vi.fn<(lat: number, lng: number) => Promise<string | null>>(async () => "Palermo, Buenos Aires")
  const follow = vi.fn<ResolveLinkDeps["follow"]>(async () => ({ ok: false, reason: "network" }))
  const deps: ResolveLinkDeps = { follow, geocoder: () => ({ reverse }), log: vi.fn(), ...over }
  return { deps, reverse, follow }
}

describe("resolveMapsLocation", () => {
  it("keeps the exact coordinates (the pin wins over the viewport) and takes the label from the URL", async () => {
    const { deps, reverse } = make()
    expect(await resolveMapsLocation(FULL, deps)).toEqual({ ok: true, lat: -34.58123, lng: -58.42087, label: "Plaza Italia" })
    expect(reverse).not.toHaveBeenCalled()
  })

  it("reverse-geocodes the rounded position when the URL has no name", async () => {
    const { deps, reverse } = make()
    expect(await resolveMapsLocation("https://www.google.com/maps/@-34.5937,-58.4251,15z", deps)).toEqual({
      ok: true,
      lat: -34.5937,
      lng: -58.4251,
      label: "Palermo, Buenos Aires",
    })
    expect(reverse).toHaveBeenCalledWith(-34.59, -58.43)
  })

  it("trims the stored position to 6 decimals", async () => {
    const { deps } = make()
    expect(await resolveMapsLocation("https://www.google.com/maps/@-34.59371234,-58.42509876,15z", deps)).toMatchObject({
      lat: -34.593712,
      lng: -58.425099,
    })
  })

  it("never sends the exact coordinates to the geocoder", async () => {
    const { deps, reverse } = make()
    await resolveMapsLocation("https://www.google.com/maps/@-34.5937,-58.4251,15z", deps)
    expect(JSON.stringify(reverse.mock.calls)).not.toMatch(/34\.5937|58\.4251/)
  })

  it("has a null label, but still resolves, when geocoding finds nothing or throws", async () => {
    const none = make({ geocoder: () => ({ reverse: async () => null }) })
    expect(await resolveMapsLocation("https://www.google.com/maps/@1.5,2.5,3z", none.deps)).toEqual({
      ok: true,
      lat: 1.5,
      lng: 2.5,
      label: null,
    })
    const boom = make({
      geocoder: () => {
        throw new Error("secret")
      },
    })
    expect(await resolveMapsLocation("https://www.google.com/maps/@1.5,2.5,3z", boom.deps)).toMatchObject({
      ok: true,
      label: null,
    })
  })

  it("resolves a short link through the follower, then reads the final URL", async () => {
    const { deps, follow } = make()
    follow.mockResolvedValueOnce({ ok: true, url: FULL })
    expect(await resolveMapsLocation("https://maps.app.goo.gl/AbCd", deps)).toEqual({
      ok: true,
      lat: -34.58123,
      lng: -58.42087,
      label: "Plaza Italia",
    })
    expect(follow).toHaveBeenCalledWith("https://maps.app.goo.gl/AbCd")
  })

  it("does not follow anything for a full URL", async () => {
    const { deps, follow } = make()
    await resolveMapsLocation(FULL, deps)
    expect(follow).not.toHaveBeenCalled()
  })

  it("gives not_maps_link for a host that is not Google, without following anything", async () => {
    const { deps, follow } = make()
    expect(await resolveMapsLocation("https://evil.example/maps/@1.5,2.5,3z", deps)).toEqual({
      ok: false,
      reason: "not_maps_link",
    })
    expect(follow).not.toHaveBeenCalled()
  })

  it("gives unreadable for a Google Maps link with no position", async () => {
    const { deps } = make()
    expect(await resolveMapsLocation("https://www.google.com/maps/place/Plaza+Italia", deps)).toEqual({
      ok: false,
      reason: "unreadable",
    })
  })

  it("gives not_maps_link when a short link redirects off Google, and unreadable for other follow failures", async () => {
    const { deps, follow } = make()
    follow.mockResolvedValueOnce({ ok: false, reason: "disallowed_host" })
    expect(await resolveMapsLocation("https://maps.app.goo.gl/AbCd", deps)).toEqual({ ok: false, reason: "not_maps_link" })
    for (const reason of ["too_many_redirects", "no_redirect", "network"] as const) {
      follow.mockResolvedValueOnce({ ok: false, reason })
      expect(await resolveMapsLocation("https://maps.app.goo.gl/AbCd", deps)).toEqual({ ok: false, reason: "unreadable" })
    }
  })

  it("gives unreadable when the followed URL has no position, or is itself still short", async () => {
    const { deps, follow } = make()
    follow.mockResolvedValueOnce({ ok: true, url: "https://www.google.com/maps/place/Foo" })
    expect(await resolveMapsLocation("https://maps.app.goo.gl/AbCd", deps)).toEqual({ ok: false, reason: "unreadable" })
    follow.mockResolvedValueOnce({ ok: true, url: "https://maps.app.goo.gl/Other" })
    expect(await resolveMapsLocation("https://maps.app.goo.gl/AbCd", deps)).toEqual({ ok: false, reason: "unreadable" })
  })

  it("never throws: an unexpected follower error is unreadable, logged without the link", async () => {
    const { deps, follow } = make()
    follow.mockRejectedValueOnce(new Error("https://maps.app.goo.gl/AbCd exploded"))
    expect(await resolveMapsLocation("https://maps.app.goo.gl/AbCd", deps)).toEqual({ ok: false, reason: "unreadable" })
    expect(JSON.stringify(vi.mocked(deps.log).mock.calls)).not.toContain("goo.gl")
  })

  it("trims the input and rejects a non-string", async () => {
    const { deps } = make()
    expect(await resolveMapsLocation(`  ${FULL}  `, deps)).toMatchObject({ ok: true })
    expect(await resolveMapsLocation(42, deps)).toEqual({ ok: false, reason: "not_maps_link" })
  })

  it("trims a long label to 120 characters", async () => {
    const { deps } = make({ geocoder: () => ({ reverse: async () => "x".repeat(300) }) })
    const out = await resolveMapsLocation("https://www.google.com/maps/@1.5,2.5,3z", deps)
    expect(out.ok && [...out.label!].length).toBe(120)
  })
})

describe("resolveMapsLinkWith (the server action)", () => {
  const withSession = (over: Partial<Parameters<typeof resolveMapsLinkWith>[0]> = {}) => {
    const { deps, ...rest } = make()
    return { deps: { ...deps, currentVisitor: async () => ({ handle: "ana" }), ...over }, ...rest }
  }

  it("requires a session and touches nothing without one", async () => {
    const { deps, follow, reverse } = withSession({ currentVisitor: async () => null })
    expect(await resolveMapsLinkWith(deps, { url: FULL })).toEqual({ ok: false, reason: "no_session" })
    expect(follow).not.toHaveBeenCalled()
    expect(reverse).not.toHaveBeenCalled()
  })

  it("returns the position and the label", async () => {
    const { deps } = withSession()
    expect(await resolveMapsLinkWith(deps, { url: FULL })).toEqual({ ok: true, lat: -34.58123, lng: -58.42087, label: "Plaza Italia" })
  })

  it("passes the typed failures through", async () => {
    const { deps } = withSession()
    expect(await resolveMapsLinkWith(deps, { url: "https://evil.example" })).toEqual({ ok: false, reason: "not_maps_link" })
    expect(await resolveMapsLinkWith(deps, { url: "https://www.google.com/maps/place/Foo" })).toEqual({
      ok: false,
      reason: "unreadable",
    })
  })

  it.each([null, undefined, "x", 3, {}, { url: 5 }])("treats a malformed input (%s) as not a Maps link", async (input) => {
    const { deps, follow } = withSession()
    expect(await resolveMapsLinkWith(deps, input)).toEqual({ ok: false, reason: "not_maps_link" })
    expect(follow).not.toHaveBeenCalled()
  })
})
