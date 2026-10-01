import { describe, expect, it } from "vitest"
import { coordinatesLabel, googleMapsUrl, PLACE_COPY } from "./place-model"

describe("googleMapsUrl", () => {
  it("links the rounded position on Google Maps", () => {
    expect(googleMapsUrl(-34.59, -58.42)).toBe("https://www.google.com/maps?q=-34.59,-58.42")
  })

  it("keeps trailing zeros out of the way and never adds precision", () => {
    expect(googleMapsUrl(10, 20.5)).toBe("https://www.google.com/maps?q=10,20.5")
  })
})

describe("coordinatesLabel", () => {
  it("shows a near position with 2 decimals", () => {
    expect(coordinatesLabel(-34.59, -58.42)).toBe("Cerca de -34.59, -58.42")
    expect(coordinatesLabel(10, 20.5)).toBe("Cerca de 10.00, 20.50")
  })
})

describe("PLACE_COPY", () => {
  it("never suggests the visitor's own location", () => {
    expect(JSON.stringify(PLACE_COPY)).not.toMatch(/desde dónde|tu ubicación|dónde estás/i)
  })

  it("uses the neutral tú, never voseo", () => {
    expect(JSON.stringify(PLACE_COPY)).not.toMatch(/\b(pegá|elegí|querés|podés)\b/i)
  })
})
