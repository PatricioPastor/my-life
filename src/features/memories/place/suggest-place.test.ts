import { describe, expect, it, vi } from "vitest"
import type { PlaceDescription } from "./reverse-geocoder"
import { suggestPlaceWith } from "./suggest-place"

const PALERMO: PlaceDescription = { label: "Palermo, Buenos Aires", address: "Honduras 4000, Buenos Aires" }

const make = (over: Partial<Parameters<typeof suggestPlaceWith>[0]> = {}) => {
  const reverse = vi.fn<(lat: number, lng: number) => Promise<PlaceDescription | null>>(async () => PALERMO)
  const deps = {
    currentVisitor: async () => ({ handle: "ana" }),
    geocoder: () => ({ reverse }),
    log: vi.fn(),
    ...over,
  }
  return { deps, reverse }
}

describe("suggestPlaceWith", () => {
  it("requires a session", async () => {
    const { deps, reverse } = make({ currentVisitor: async () => null })
    expect(await suggestPlaceWith(deps, { lat: -34.59, lng: -58.42 })).toEqual({ ok: false, reason: "no_session" })
    expect(reverse).not.toHaveBeenCalled()
  })

  it("returns the label and the street address", async () => {
    const { deps, reverse } = make()
    expect(await suggestPlaceWith(deps, { lat: -34.59, lng: -58.42 })).toEqual({
      ok: true,
      label: "Palermo, Buenos Aires",
      address: "Honduras 4000, Buenos Aires",
    })
    expect(reverse).toHaveBeenCalledWith(-34.59, -58.42)
  })

  it("geocodes the exact position, to 6 decimals, not a rounded one", async () => {
    const { deps, reverse } = make()
    await suggestPlaceWith(deps, { lat: -34.59371234, lng: -58.42158949 })
    expect(reverse).toHaveBeenCalledTimes(1)
    expect(reverse).toHaveBeenCalledWith(-34.593712, -58.421589)
  })

  it("accepts a position that is only a few metres from the 0,0 point", async () => {
    const { deps, reverse } = make()
    expect(await suggestPlaceWith(deps, { lat: 0.001, lng: -0.002 })).toMatchObject({ ok: true })
    expect(reverse).toHaveBeenCalledWith(0.001, -0.002)
  })

  it.each([
    ["latitude out of range", { lat: 91, lng: 0.5 }],
    ["longitude out of range", { lat: 0.5, lng: 181 }],
    ["strings", { lat: "-34.59", lng: "-58.42" }],
    ["the 0,0 no-fix position", { lat: 0, lng: 0 }],
    ["NaN", { lat: Number.NaN, lng: 1 }],
    ["missing fields", { lat: 1 }],
    ["null", null],
    ["a non-object", "x"],
  ])("rejects %s without geocoding", async (_label, input) => {
    const { deps, reverse } = make()
    expect(await suggestPlaceWith(deps, input)).toEqual({ ok: false, reason: "invalid" })
    expect(reverse).not.toHaveBeenCalled()
  })

  it("returns no label and no address when geocoding finds nothing or throws", async () => {
    const { deps } = make({ geocoder: () => ({ reverse: async () => null }) })
    expect(await suggestPlaceWith(deps, { lat: 1.5, lng: 2.5 })).toEqual({ ok: true, label: null, address: null })

    const boom = make({
      geocoder: () => {
        throw new Error("secret detail")
      },
    })
    expect(await suggestPlaceWith(boom.deps, { lat: 1.5, lng: 2.5 })).toEqual({ ok: true, label: null, address: null })
    const logged = vi.mocked(boom.deps.log).mock.calls
    expect(logged).toHaveLength(1)
    expect(String(logged[0][0])).not.toContain("secret detail")
  })
})
