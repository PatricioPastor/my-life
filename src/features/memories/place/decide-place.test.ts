import { describe, expect, it, vi } from "vitest"
import { decidePlace } from "./decide-place"

const NONE = { approxLatitude: null, approxLongitude: null, locationSource: null, placeName: null }
const PHOTO = { latitude: -34.59, longitude: -58.42 }

const make = (label: string | null | Error = "Palermo, Buenos Aires") => {
  const reverse = vi.fn(async () => {
    if (label instanceof Error) throw label
    return label
  })
  const deps = { geocoder: () => ({ reverse }), log: vi.fn() }
  return { deps, reverse }
}

describe("decidePlace (photo GPS path)", () => {
  it("stores nothing, and does not geocode, without consent", async () => {
    const { deps, reverse } = make()
    expect(await decidePlace({ shareLocation: false, photo: PHOTO }, deps)).toEqual(NONE)
    expect(reverse).not.toHaveBeenCalled()
  })

  it("stores nothing when there is consent but the photo has no GPS", async () => {
    const { deps, reverse } = make()
    expect(await decidePlace({ shareLocation: true, photo: null }, deps)).toEqual(NONE)
    expect(reverse).not.toHaveBeenCalled()
  })

  it("stores the rounded photo position, the source photo and the geocoded name", async () => {
    const { deps, reverse } = make()
    expect(await decidePlace({ shareLocation: true, photo: PHOTO }, deps)).toEqual({
      approxLatitude: -34.59,
      approxLongitude: -58.42,
      locationSource: "photo",
      placeName: "Palermo, Buenos Aires",
    })
    expect(reverse).toHaveBeenCalledWith(-34.59, -58.42)
  })

  it("keeps the location, with no name, when geocoding finds nothing", async () => {
    const { deps } = make(null)
    expect(await decidePlace({ shareLocation: true, photo: PHOTO }, deps)).toMatchObject({
      approxLatitude: -34.59,
      locationSource: "photo",
      placeName: null,
    })
  })

  it("keeps the location, with no name, when geocoding throws, and logs without coordinates", async () => {
    const { deps } = make(new Error("-34.59 boom"))
    expect(await decidePlace({ shareLocation: true, photo: PHOTO }, deps)).toMatchObject({
      approxLatitude: -34.59,
      placeName: null,
    })
    expect(JSON.stringify(deps.log.mock.calls)).not.toMatch(/34\.59/)
  })

  it("caps the stored name at 120 characters", async () => {
    const { deps } = make("x".repeat(300))
    const out = await decidePlace({ shareLocation: true, photo: PHOTO }, deps)
    expect([...out.placeName!]).toHaveLength(120)
  })

  it("only an explicit true opts in", async () => {
    const { deps } = make()
    expect(await decidePlace({ shareLocation: "true" as never, photo: PHOTO }, deps)).toEqual(NONE)
  })
})
