import { describe, expect, it, vi } from "vitest"
import { suggestPlaceWith } from "./suggest-place"

const make = (over: Partial<Parameters<typeof suggestPlaceWith>[0]> = {}) => {
  const reverse = vi.fn<(lat: number, lng: number) => Promise<string | null>>(async () => "Palermo, Buenos Aires")
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

  it("returns the label for a rounded position", async () => {
    const { deps, reverse } = make()
    expect(await suggestPlaceWith(deps, { lat: -34.59, lng: -58.42 })).toEqual({ ok: true, label: "Palermo, Buenos Aires" })
    expect(reverse).toHaveBeenCalledWith(-34.59, -58.42)
  })

  it("accepts an exact position but only ever geocodes it rounded to 2 decimals", async () => {
    const { deps, reverse } = make()
    expect(await suggestPlaceWith(deps, { lat: -34.593712, lng: -58.421589 })).toEqual({
      ok: true,
      label: "Palermo, Buenos Aires",
    })
    expect(reverse).toHaveBeenCalledTimes(1)
    expect(reverse).toHaveBeenCalledWith(-34.59, -58.42)
    expect(JSON.stringify(reverse.mock.calls)).not.toMatch(/593712|421589/)
  })

  it.each([
    ["latitude out of range", { lat: 91, lng: 0.5 }],
    ["longitude out of range", { lat: 0.5, lng: 181 }],
    ["strings", { lat: "-34.59", lng: "-58.42" }],
    ["the 0,0 no-fix position", { lat: 0, lng: 0 }],
    ["a position that rounds to 0,0", { lat: 0.001, lng: -0.002 }],
    ["NaN", { lat: Number.NaN, lng: 1 }],
    ["missing fields", { lat: 1 }],
    ["null", null],
    ["a non-object", "x"],
  ])("rejects %s without geocoding", async (_label, input) => {
    const { deps, reverse } = make()
    expect(await suggestPlaceWith(deps, input)).toEqual({ ok: false, reason: "invalid" })
    expect(reverse).not.toHaveBeenCalled()
  })

  it("returns a null label when geocoding finds nothing or throws", async () => {
    const { deps } = make({ geocoder: () => ({ reverse: async () => null }) })
    expect(await suggestPlaceWith(deps, { lat: 1.5, lng: 2.5 })).toEqual({ ok: true, label: null })

    const boom = make({
      geocoder: () => {
        throw new Error("secret detail")
      },
    })
    expect(await suggestPlaceWith(boom.deps, { lat: 1.5, lng: 2.5 })).toEqual({ ok: true, label: null })
    const logged = vi.mocked(boom.deps.log).mock.calls
    expect(logged).toHaveLength(1)
    expect(String(logged[0][0])).not.toContain("secret detail")
  })
})
