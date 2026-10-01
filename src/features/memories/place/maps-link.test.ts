import { describe, expect, it } from "vitest"
import { isGoogleHost, isShortLinkHost, parseMapsLink } from "./maps-link"

const loc = (lat: number, lng: number, name: string | null = null) => ({ kind: "location", lat, lng, name })

describe("parseMapsLink: coordinates", () => {
  it("reads @lat,lng,zoom", () => {
    expect(parseMapsLink("https://www.google.com/maps/@-34.5937,-58.4251,15z")).toEqual(loc(-34.5937, -58.4251))
  })

  it("reads the place name and @lat,lng from /maps/place/<Name>/@...", () => {
    expect(parseMapsLink("https://www.google.com/maps/place/Plaza+Italia/@-34.5810,-58.4208,17z/data=!3m1!4b1")).toEqual(
      loc(-34.581, -58.4208, "Plaza Italia"),
    )
  })

  it("decodes the name: percent escapes, plus as space", () => {
    expect(parseMapsLink("https://www.google.com/maps/place/Caf%C3%A9+Tortoni,+Av.+de+Mayo/@-34.6,-58.38,17z")).toEqual(
      loc(-34.6, -58.38, "Café Tortoni, Av. de Mayo"),
    )
  })

  it("prefers the !3d!4d pin over the @ viewport", () => {
    const url =
      "https://www.google.com/maps/place/Caf%C3%A9+Tortoni/@-34.60,-58.38,17z/data=!4m6!3m5!1s0x95bccacd:0x1!8m2!3d-34.6089!4d-58.3797!16s%2Fg%2F1"
    expect(parseMapsLink(url)).toEqual(loc(-34.6089, -58.3797, "Café Tortoni"))
  })

  it("reads !3d!4d when there is nothing else", () => {
    expect(parseMapsLink("https://www.google.com/maps/data=!4m2!3d40.7128!4d-74.006")).toEqual(loc(40.7128, -74.006))
  })

  it.each(["q", "query", "ll"])("reads ?%s=lat,lng", (key) => {
    expect(parseMapsLink(`https://www.google.com/maps?${key}=-34.59,-58.42`)).toEqual(loc(-34.59, -58.42))
  })

  it("reads encoded and spaced pairs, and the loc: prefix", () => {
    expect(parseMapsLink("https://www.google.com/maps?q=-34.59%2C-58.42")).toEqual(loc(-34.59, -58.42))
    expect(parseMapsLink("https://www.google.com/maps?q=-34.59,%20-58.42")).toEqual(loc(-34.59, -58.42))
    expect(parseMapsLink("https://maps.google.com/?q=loc:-34.59,-58.42")).toEqual(loc(-34.59, -58.42))
  })

  it("reads the api=1 search form", () => {
    expect(parseMapsLink("https://www.google.com/maps/search/?api=1&query=-34.59,-58.42")).toEqual(loc(-34.59, -58.42))
  })

  it("accepts integers and positive values", () => {
    expect(parseMapsLink("https://www.google.com/maps/@40,3,10z")).toEqual(loc(40, 3))
  })

  it("is case-insensitive for the host", () => {
    expect(parseMapsLink("https://WWW.Google.COM/maps/@1.5,2.5,10z")).toEqual(loc(1.5, 2.5))
  })

  it.each([
    ["latitude out of range", "https://www.google.com/maps/@95.1,20,10z"],
    ["longitude out of range", "https://www.google.com/maps/@10,200.5,10z"],
    ["the 0,0 position", "https://www.google.com/maps/@0,0,3z"],
    ["a query that is an address", "https://www.google.com/maps?q=Caf%C3%A9+Tortoni"],
    ["a place with no coordinates", "https://www.google.com/maps/place/Plaza+Italia"],
  ])("says there is no location for %s", (_label, url) => {
    expect(parseMapsLink(url)).toEqual({ kind: "invalid", reason: "no_location" })
  })

  it("ignores a place name that is only coordinates", () => {
    expect(parseMapsLink("https://www.google.com/maps/place/-34.59,-58.42/@-34.59,-58.42,17z")).toEqual(loc(-34.59, -58.42))
  })

  it("survives a malformed escape in the name", () => {
    expect(parseMapsLink("https://www.google.com/maps/place/Caf%E9%A/@1.5,2.5,17z")).toEqual(loc(1.5, 2.5))
  })

  it("strips control characters and caps a long name at 120 characters", () => {
    const long = parseMapsLink(`https://www.google.com/maps/place/${"a".repeat(300)}/@1.5,2.5,17z`)
    expect(long.kind === "location" && [...long.name!].length).toBe(120)
    expect(parseMapsLink("https://www.google.com/maps/place/A%00B/@1.5,2.5,17z")).toEqual(loc(1.5, 2.5, "AB"))
  })
})

describe("parseMapsLink: hosts", () => {
  it.each([
    "https://maps.google.com/?q=1.5,2.5",
    "https://google.com/maps/@1.5,2.5,10z",
    "https://www.google.com.ar/maps/@1.5,2.5,10z",
    "https://www.google.co.uk/maps/@1.5,2.5,10z",
    "https://www.google.es/maps/@1.5,2.5,10z",
    "https://maps.google.com.mx/?ll=1.5,2.5",
    "https://www.google.com.br/maps?q=1.5,2.5",
  ])("accepts the Google host in %s", (url) => {
    expect(parseMapsLink(url)).toMatchObject({ kind: "location", lat: 1.5, lng: 2.5 })
  })

  it.each([
    ["a look-alike suffix", "https://google.com.evil.com/maps/@1.5,2.5,10z"],
    ["a look-alike prefix", "https://notgoogle.com/maps/@1.5,2.5,10z"],
    ["a different host with google in the path", "https://evil.com/www.google.com/maps/@1.5,2.5,10z"],
    ["userinfo that hides the real host", "https://www.google.com@evil.com/maps/@1.5,2.5,10z"],
    ["userinfo on a Google host", "https://user:pw@www.google.com/maps/@1.5,2.5,10z"],
    ["plain http", "http://www.google.com/maps/@1.5,2.5,10z"],
    ["another scheme", "javascript:alert(1)"],
    ["a custom port", "https://www.google.com:8443/maps/@1.5,2.5,10z"],
    ["a non-maps Google page", "https://www.google.com/search?q=1.5,2.5"],
    ["the Google home page", "https://www.google.com/"],
    ["an IP address", "https://142.250.1.1/maps/@1.5,2.5,10z"],
    ["a made-up TLD", "https://www.google.evil/maps/@1.5,2.5,10z"],
  ])("rejects %s", (_label, url) => {
    expect(parseMapsLink(url)).toEqual({ kind: "invalid", reason: "not_maps_link" })
  })

  it.each([
    ["", "empty"],
    ["   ", "blank"],
    ["not a url", "text"],
    ["www.google.com/maps/@1.5,2.5,10z", "no scheme"],
    ["https://", "no host"],
    [`https://www.google.com/maps/@1.5,2.5,10z?${"a".repeat(3000)}`, "too long"],
  ])("rejects garbage (%s: %s)", (value) => {
    expect(parseMapsLink(value)).toEqual({ kind: "invalid", reason: "not_maps_link" })
  })

  it.each([null, undefined, 42, {}, ["https://www.google.com/maps/@1.5,2.5,10z"]])("rejects a non-string (%s)", (value) => {
    expect(parseMapsLink(value as never)).toEqual({ kind: "invalid", reason: "not_maps_link" })
  })
})

describe("parseMapsLink: short links", () => {
  it.each([
    "https://maps.app.goo.gl/AbCdEf123",
    "https://goo.gl/maps/AbCdEf123",
    "https://MAPS.APP.GOO.GL/AbCdEf123?g_st=ic",
  ])("recognises %s without resolving it", (url) => {
    expect(parseMapsLink(url)).toEqual({ kind: "short", url: new URL(url).href })
  })

  it.each([
    "https://maps.app.goo.gl",
    "https://maps.app.goo.gl/",
    "https://goo.gl/something-else",
    "https://goo.gl/",
    "http://maps.app.goo.gl/AbCd",
    "https://evil.goo.gl.example.com/maps/AbCd",
    "https://app.goo.gl/AbCd",
  ])("rejects %s", (url) => {
    expect(parseMapsLink(url)).toEqual({ kind: "invalid", reason: "not_maps_link" })
  })
})

describe("host allowlists", () => {
  it("knows the Google hosts", () => {
    for (const host of ["google.com", "www.google.com", "maps.google.com", "www.google.com.ar", "maps.google.co.uk"]) {
      expect(isGoogleHost(host)).toBe(true)
    }
    for (const host of ["goo.gl", "google.com.evil.com", "evil.com", "google", "mail.google.com", "xgoogle.com"]) {
      expect(isGoogleHost(host)).toBe(false)
    }
  })

  it("knows the short-link hosts", () => {
    expect(isShortLinkHost("maps.app.goo.gl")).toBe(true)
    expect(isShortLinkHost("goo.gl")).toBe(true)
    expect(isShortLinkHost("www.goo.gl")).toBe(false)
    expect(isShortLinkHost("google.com")).toBe(false)
  })
})
