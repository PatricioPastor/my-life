import { describe, expect, it, vi } from "vitest"
import { decidePlace, type DecidePlaceDeps } from "./decide-place"

const NONE = { approxLatitude: null, approxLongitude: null, locationSource: null, placeName: null }
const PHOTO = { latitude: -34.59, longitude: -58.42 }
const LINK = "https://www.google.com/maps/place/Plaza+Italia/@-34.5810,-58.4208,17z"
const LINK_NO_NAME = "https://www.google.com/maps/@40.7128,-74.006,12z"

const make = (label: string | null | Error = "Palermo, Buenos Aires") => {
  const reverse = vi.fn<(lat: number, lng: number) => Promise<string | null>>(async () => {
    if (label instanceof Error) throw label
    return label
  })
  const follow = vi.fn<DecidePlaceDeps["follow"]>(async () => ({ ok: false, reason: "network" }))
  const deps: DecidePlaceDeps = { geocoder: () => ({ reverse }), follow, log: vi.fn() }
  return { deps, reverse, follow }
}

describe("decidePlace: no link (the photo GPS path)", () => {
  it("stores nothing, and does not geocode, without consent", async () => {
    const { deps, reverse } = make()
    expect(await decidePlace({ shareLocation: false, mapsUrl: undefined, photo: PHOTO }, deps)).toEqual(NONE)
    expect(reverse).not.toHaveBeenCalled()
  })

  it("stores nothing when there is consent but the photo has no GPS", async () => {
    const { deps, reverse } = make()
    expect(await decidePlace({ shareLocation: true, mapsUrl: undefined, photo: null }, deps)).toEqual(NONE)
    expect(reverse).not.toHaveBeenCalled()
  })

  it("stores the rounded photo position, the source photo and the geocoded name", async () => {
    const { deps, reverse } = make()
    expect(await decidePlace({ shareLocation: true, mapsUrl: undefined, photo: PHOTO }, deps)).toEqual({
      approxLatitude: -34.59,
      approxLongitude: -58.42,
      locationSource: "photo",
      placeName: "Palermo, Buenos Aires",
    })
    expect(reverse).toHaveBeenCalledWith(-34.59, -58.42)
  })

  it("keeps the location, with no name, when geocoding finds nothing", async () => {
    const { deps } = make(null)
    expect(await decidePlace({ shareLocation: true, mapsUrl: undefined, photo: PHOTO }, deps)).toMatchObject({
      approxLatitude: -34.59,
      locationSource: "photo",
      placeName: null,
    })
  })

  it("keeps the location, with no name, when geocoding throws, and logs without coordinates", async () => {
    const { deps } = make(new Error("-34.59 boom"))
    expect(await decidePlace({ shareLocation: true, mapsUrl: undefined, photo: PHOTO }, deps)).toMatchObject({
      approxLatitude: -34.59,
      placeName: null,
    })
    expect(JSON.stringify(vi.mocked(deps.log).mock.calls)).not.toMatch(/34\.59/)
  })

  it("caps the stored name at 120 characters", async () => {
    const { deps } = make("x".repeat(300))
    const out = await decidePlace({ shareLocation: true, mapsUrl: undefined, photo: PHOTO }, deps)
    expect([...out.placeName!]).toHaveLength(120)
  })

  it("only an explicit true opts in", async () => {
    const { deps } = make()
    expect(await decidePlace({ shareLocation: "true", mapsUrl: undefined, photo: PHOTO }, deps)).toEqual(NONE)
  })

  it.each([undefined, null, "", "   ", 42, {}])("treats a blank or non-string link (%s) as no link", async (mapsUrl) => {
    const { deps, follow } = make()
    expect(await decidePlace({ shareLocation: true, mapsUrl, photo: PHOTO }, deps)).toMatchObject({ locationSource: "photo" })
    expect(follow).not.toHaveBeenCalled()
  })
})

describe("decidePlace: a Google Maps link", () => {
  it("stores the link position, the source link and the name from the URL", async () => {
    const { deps, reverse } = make()
    expect(await decidePlace({ shareLocation: true, mapsUrl: LINK, photo: null }, deps)).toEqual({
      approxLatitude: -34.58,
      approxLongitude: -58.42,
      locationSource: "link",
      placeName: "Plaza Italia",
    })
    expect(reverse).not.toHaveBeenCalled()
  })

  it("reverse-geocodes the rounded position when the link carries no name", async () => {
    const { deps, reverse } = make()
    expect(await decidePlace({ shareLocation: true, mapsUrl: LINK_NO_NAME, photo: null }, deps)).toEqual({
      approxLatitude: 40.71,
      approxLongitude: -74.01,
      locationSource: "link",
      placeName: "Palermo, Buenos Aires",
    })
    expect(reverse).toHaveBeenCalledWith(40.71, -74.01)
  })

  it("wins over the photo position", async () => {
    const { deps } = make()
    expect(await decidePlace({ shareLocation: true, mapsUrl: LINK, photo: PHOTO }, deps)).toMatchObject({
      approxLatitude: -34.58,
      locationSource: "link",
    })
  })

  it("resolves a short link on the server and stores what it points to", async () => {
    const { deps, follow } = make()
    follow.mockResolvedValueOnce({ ok: true, url: LINK })
    expect(await decidePlace({ shareLocation: true, mapsUrl: "https://maps.app.goo.gl/AbCd", photo: null }, deps)).toMatchObject({
      approxLatitude: -34.58,
      locationSource: "link",
      placeName: "Plaza Italia",
    })
  })

  it("keeps the location, with no name, when naming the link position fails", async () => {
    const { deps } = make(new Error("down"))
    expect(await decidePlace({ shareLocation: true, mapsUrl: LINK_NO_NAME, photo: null }, deps)).toMatchObject({
      approxLatitude: 40.71,
      locationSource: "link",
      placeName: null,
    })
  })

  it("is ignored, and not even resolved, without consent", async () => {
    const { deps, follow, reverse } = make()
    expect(await decidePlace({ shareLocation: false, mapsUrl: "https://maps.app.goo.gl/AbCd", photo: PHOTO }, deps)).toEqual(NONE)
    expect(follow).not.toHaveBeenCalled()
    expect(reverse).not.toHaveBeenCalled()
  })

  it.each([
    ["not a Google host", "https://evil.example/maps/@1.5,2.5,3z"],
    ["a Maps link with no position", "https://www.google.com/maps/place/Plaza+Italia"],
    ["a short link that cannot be followed", "https://maps.app.goo.gl/AbCd"],
  ])("stores no location at all for %s, and never falls back to the photo", async (_label, mapsUrl) => {
    const { deps } = make()
    expect(await decidePlace({ shareLocation: true, mapsUrl, photo: PHOTO }, deps)).toEqual(NONE)
  })
})
