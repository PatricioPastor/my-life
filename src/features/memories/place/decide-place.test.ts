import { describe, expect, it, vi } from "vitest"
import { decidePlace, type DecidePlaceDeps } from "./decide-place"
import type { PlaceDescription } from "./reverse-geocoder"

const NONE = { latitude: null, longitude: null, locationSource: null, placeName: null, placeAddress: null }
// Exact, as read from the photo's EXIF: the geocoder gets exactly it (6 decimals), because the address needs it.
const PHOTO = { latitude: -34.593712, longitude: -58.421589 }
const LINK = "https://www.google.com/maps/place/Plaza+Italia/@-34.5810,-58.4208,17z"
const LINK_NO_NAME = "https://www.google.com/maps/@40.712812,-74.006009,12z"
const DESCRIBED: PlaceDescription = { label: "Palermo, Buenos Aires", address: "Honduras 4000, Buenos Aires" }

const make = (answer: PlaceDescription | null | Error = DESCRIBED) => {
  const reverse = vi.fn<(lat: number, lng: number) => Promise<PlaceDescription | null>>(async () => {
    if (answer instanceof Error) throw answer
    return answer
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

  it("stores the exact photo position, the source photo, the name and the street address", async () => {
    const { deps, reverse } = make()
    expect(await decidePlace({ shareLocation: true, mapsUrl: undefined, photo: PHOTO }, deps)).toEqual({
      latitude: -34.593712,
      longitude: -58.421589,
      locationSource: "photo",
      placeName: "Palermo, Buenos Aires",
      placeAddress: "Honduras 4000, Buenos Aires",
    })
    // The address needs the exact position: that is what the geocoder is asked about.
    expect(reverse).toHaveBeenCalledTimes(1)
    expect(reverse).toHaveBeenCalledWith(-34.593712, -58.421589)
  })

  it("keeps the location, with no name and no address, when geocoding finds nothing", async () => {
    const { deps } = make(null)
    expect(await decidePlace({ shareLocation: true, mapsUrl: undefined, photo: PHOTO }, deps)).toMatchObject({
      latitude: -34.593712,
      locationSource: "photo",
      placeName: null,
      placeAddress: null,
    })
  })

  it("keeps the name when there is no street, and the address when there is no area", async () => {
    const onlyName = make({ label: "Palermo, Buenos Aires", address: null })
    expect(await decidePlace({ shareLocation: true, mapsUrl: undefined, photo: PHOTO }, onlyName.deps)).toMatchObject({
      placeName: "Palermo, Buenos Aires",
      placeAddress: null,
    })
    const onlyAddress = make({ label: null, address: "Honduras 4000" })
    expect(await decidePlace({ shareLocation: true, mapsUrl: undefined, photo: PHOTO }, onlyAddress.deps)).toMatchObject({
      placeName: null,
      placeAddress: "Honduras 4000",
    })
  })

  it("keeps the location, with no name, when geocoding throws, and logs without coordinates", async () => {
    const { deps } = make(new Error("-34.59 boom"))
    expect(await decidePlace({ shareLocation: true, mapsUrl: undefined, photo: PHOTO }, deps)).toMatchObject({
      latitude: -34.593712,
      placeName: null,
      placeAddress: null,
    })
    expect(JSON.stringify(vi.mocked(deps.log).mock.calls)).not.toMatch(/34\.59/)
  })

  it("caps the stored name at 120 characters and the address at 200", async () => {
    const { deps } = make({ label: "x".repeat(300), address: "y".repeat(300) })
    const out = await decidePlace({ shareLocation: true, mapsUrl: undefined, photo: PHOTO }, deps)
    expect([...out.placeName!]).toHaveLength(120)
    expect([...out.placeAddress!]).toHaveLength(200)
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
  it("stores the link position and source; the name is the one in the URL and the address is geocoded from the exact pin", async () => {
    const { deps, reverse } = make()
    expect(await decidePlace({ shareLocation: true, mapsUrl: LINK, photo: null }, deps)).toEqual({
      latitude: -34.581,
      longitude: -58.4208,
      locationSource: "link",
      placeName: "Plaza Italia",
      placeAddress: "Honduras 4000, Buenos Aires",
    })
    expect(reverse).toHaveBeenCalledTimes(1)
    expect(reverse).toHaveBeenCalledWith(-34.581, -58.4208)
  })

  it("names a nameless link by reverse geocoding its exact position, and takes the address from the same answer", async () => {
    const { deps, reverse } = make()
    expect(await decidePlace({ shareLocation: true, mapsUrl: LINK_NO_NAME, photo: null }, deps)).toEqual({
      latitude: 40.712812,
      longitude: -74.006009,
      locationSource: "link",
      placeName: "Palermo, Buenos Aires",
      placeAddress: "Honduras 4000, Buenos Aires",
    })
    expect(reverse).toHaveBeenCalledTimes(1)
    expect(reverse).toHaveBeenCalledWith(40.712812, -74.006009)
  })

  it("wins over the photo position", async () => {
    const { deps } = make()
    expect(await decidePlace({ shareLocation: true, mapsUrl: LINK, photo: PHOTO }, deps)).toMatchObject({
      latitude: -34.581,
      locationSource: "link",
    })
  })

  it("resolves a short link on the server and stores what it points to", async () => {
    const { deps, follow } = make()
    follow.mockResolvedValueOnce({ ok: true, url: LINK })
    expect(await decidePlace({ shareLocation: true, mapsUrl: "https://maps.app.goo.gl/AbCd", photo: null }, deps)).toMatchObject({
      latitude: -34.581,
      locationSource: "link",
      placeName: "Plaza Italia",
    })
  })

  it("keeps the location and the URL's name, with no address, when geocoding fails", async () => {
    const { deps } = make(new Error("down"))
    expect(await decidePlace({ shareLocation: true, mapsUrl: LINK, photo: null }, deps)).toMatchObject({
      latitude: -34.581,
      locationSource: "link",
      placeName: "Plaza Italia",
      placeAddress: null,
    })
    expect(await decidePlace({ shareLocation: true, mapsUrl: LINK_NO_NAME, photo: null }, deps)).toMatchObject({
      latitude: 40.712812,
      placeName: null,
      placeAddress: null,
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

describe("decidePlace: the place of the memory it is contributed from", () => {
  const RELATED = {
    latitude: -34.5871,
    longitude: -58.4302,
    locationSource: "link" as const,
    placeName: "UOCRA",
    placeAddress: "Av. Rivadavia 1234, Junín",
  }

  it("copies every place column of the related memory when the visitor chose the same place", async () => {
    const { deps, reverse } = make()
    expect(await decidePlace({ shareLocation: false, mapsUrl: undefined, photo: null, related: RELATED }, deps)).toEqual(RELATED)
    expect(reverse).not.toHaveBeenCalled()
  })

  it("copies it with no geocoding and no link to follow", async () => {
    const { deps, follow, reverse } = make()
    await decidePlace({ shareLocation: false, mapsUrl: undefined, photo: null, related: RELATED }, deps)
    expect(follow).not.toHaveBeenCalled()
    expect(reverse).not.toHaveBeenCalled()
  })

  it("is overridden by a Maps link the visitor pasted", async () => {
    const { deps } = make()
    expect(await decidePlace({ shareLocation: true, mapsUrl: LINK, photo: null, related: RELATED }, deps)).toMatchObject({
      latitude: -34.581,
      locationSource: "link",
      placeName: "Plaza Italia",
    })
  })

  it("is overridden by the photo's own GPS when the visitor opted in to it", async () => {
    const { deps } = make()
    expect(await decidePlace({ shareLocation: true, mapsUrl: undefined, photo: PHOTO, related: RELATED }, deps)).toMatchObject({
      latitude: -34.593712,
      locationSource: "photo",
    })
  })

  it("is used when the visitor opted in to a place but the photo has no GPS", async () => {
    const { deps } = make()
    expect(await decidePlace({ shareLocation: true, mapsUrl: undefined, photo: null, related: RELATED }, deps)).toEqual(RELATED)
  })

  it("never falls back to it when a pasted link could not be read (the visitor said the place was elsewhere)", async () => {
    const { deps } = make()
    expect(
      await decidePlace({ shareLocation: true, mapsUrl: "https://evil.example/maps/@1.5,2.5,3z", photo: null, related: RELATED }, deps),
    ).toEqual(NONE)
  })

  it("stores nothing when there is no related place to copy", async () => {
    const { deps } = make()
    expect(await decidePlace({ shareLocation: false, mapsUrl: undefined, photo: null, related: null }, deps)).toEqual(NONE)
  })
})
