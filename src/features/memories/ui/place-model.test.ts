import { describe, expect, it } from "vitest"
import { coordinatesLabel, googleMapsUrl, PLACE_COPY } from "./place-model"

describe("googleMapsUrl", () => {
  it("links the position on Google Maps", () => {
    expect(googleMapsUrl(-34.59, -58.42)).toBe("https://www.google.com/maps?q=-34.59,-58.42")
  })

  it("keeps trailing zeros out of the way and never adds precision", () => {
    expect(googleMapsUrl(10, 20.5)).toBe("https://www.google.com/maps?q=10,20.5")
  })

  it("points at the exact spot when it has more decimals", () => {
    expect(googleMapsUrl(-34.593701, -58.425123)).toBe("https://www.google.com/maps?q=-34.593701,-58.425123")
  })
})

describe("coordinatesLabel", () => {
  it("shows a near position with 2 decimals, even for an exact one", () => {
    expect(coordinatesLabel(-34.593701, -58.425123)).toBe("Cerca de -34.59, -58.43")
    expect(coordinatesLabel(-34.59, -58.42)).toBe("Cerca de -34.59, -58.42")
    expect(coordinatesLabel(10, 20.5)).toBe("Cerca de 10.00, 20.50")
  })
})

describe("PLACE_COPY", () => {
  it("is honest about the exact location: it no longer promises an approximate one", () => {
    expect(JSON.stringify(PLACE_COPY)).not.toMatch(/aproximada|nunca la exacta|1 km/i)
  })

  it("says what the place is for, true for the photo's place and a pasted link's alike, and leaves saving to the consent", () => {
    expect(PLACE_COPY.help).toBe("El lugar sirve para ubicar tu recuerdo en el universo.")
    expect(PLACE_COPY.consent).toMatch(/^Guardar el lugar exacto/)
  })

  it("never suggests the visitor's own location", () => {
    expect(JSON.stringify(PLACE_COPY)).not.toMatch(/desde dónde|tu ubicación|dónde estás/i)
  })

  it("uses the neutral tú, never voseo", () => {
    expect(JSON.stringify(PLACE_COPY)).not.toMatch(/\b(pegá|elegí|querés|podés)\b/i)
  })
})
