import { describe, expect, it } from "vitest"
import { composePlaceLabel } from "./reverse-geocoder"

describe("composePlaceLabel", () => {
  it("prefers the neighbourhood or suburb plus the city", () => {
    expect(composePlaceLabel({ suburb: "Palermo", city: "Buenos Aires", country: "Argentina" })).toBe(
      "Palermo, Buenos Aires",
    )
    expect(composePlaceLabel({ neighbourhood: "Villa Crespo", suburb: "Palermo", city: "Buenos Aires" })).toBe(
      "Villa Crespo, Buenos Aires",
    )
  })

  it("uses a town or village when there is no city", () => {
    expect(composePlaceLabel({ suburb: "Centro", town: "Tigre", country: "Argentina" })).toBe("Centro, Tigre")
    expect(composePlaceLabel({ village: "Tilcara", country: "Argentina" })).toBe("Tilcara, Argentina")
  })

  it("falls back to the city plus the country", () => {
    expect(composePlaceLabel({ city: "Montevideo", country: "Uruguay" })).toBe("Montevideo, Uruguay")
  })

  it("does not repeat a name that is the same for the area and the city", () => {
    expect(composePlaceLabel({ suburb: "Madrid", city: "Madrid", country: "España" })).toBe("Madrid")
  })

  it("falls back to the state, then the country alone", () => {
    expect(composePlaceLabel({ state: "Patagonia", country: "Argentina" })).toBe("Patagonia, Argentina")
    expect(composePlaceLabel({ country: "Argentina" })).toBe("Argentina")
  })

  it("returns null when there is nothing usable", () => {
    expect(composePlaceLabel({})).toBeNull()
    expect(composePlaceLabel(null)).toBeNull()
    expect(composePlaceLabel({ road: "Calle 1", house_number: "5" })).toBeNull()
    expect(composePlaceLabel({ city: 3 as never })).toBeNull()
  })

  it("never returns more than 120 characters", () => {
    expect([...composePlaceLabel({ suburb: "x".repeat(200), city: "y".repeat(200) })!].length).toBeLessThanOrEqual(120)
  })
})
