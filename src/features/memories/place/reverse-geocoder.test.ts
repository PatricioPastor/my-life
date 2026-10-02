import { describe, expect, it } from "vitest"
import { composeAddress, composePlaceLabel, describePlace } from "./reverse-geocoder"

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
    expect(composePlaceLabel({ road: "Calle 1", house_number: "5" })).toBeNull() // streets are for the address
    expect(composePlaceLabel({ city: 3 as never })).toBeNull()
  })

  it("never returns more than 120 characters", () => {
    expect([...composePlaceLabel({ suburb: "x".repeat(200), city: "y".repeat(200) })!].length).toBeLessThanOrEqual(120)
  })
})

describe("composeAddress", () => {
  it("is the road and the house number, then the locality", () => {
    expect(composeAddress({ road: "Avenida Rivadavia", house_number: "1234", city: "Junín", country: "Argentina" })).toBe(
      "Av. Rivadavia 1234, Junín",
    )
    expect(composeAddress({ road: "Honduras", house_number: "4000", suburb: "Palermo", city: "Buenos Aires" })).toBe(
      "Honduras 4000, Buenos Aires",
    )
  })

  it("leaves out the number when there is none", () => {
    expect(composeAddress({ road: "Calle 25 de Mayo", town: "Tigre" })).toBe("Calle 25 de Mayo, Tigre")
  })

  it("takes the locality from the city, else the town, the village, the municipality or the hamlet", () => {
    expect(composeAddress({ road: "Sarmiento", house_number: "5", city: "Rosario", town: "Otro" })).toBe("Sarmiento 5, Rosario")
    expect(composeAddress({ road: "Sarmiento", house_number: "5", town: "Tigre" })).toBe("Sarmiento 5, Tigre")
    expect(composeAddress({ road: "Ruta 9", village: "Tilcara" })).toBe("Ruta 9, Tilcara")
    expect(composeAddress({ road: "Ruta 9", municipality: "Humahuaca" })).toBe("Ruta 9, Humahuaca")
    expect(composeAddress({ road: "Ruta 9", hamlet: "Maimará" })).toBe("Ruta 9, Maimará")
  })

  it("falls back to the neighbourhood, then to the road alone, when there is no locality", () => {
    expect(composeAddress({ road: "Honduras", house_number: "4000", suburb: "Palermo" })).toBe("Honduras 4000, Palermo")
    expect(composeAddress({ road: "Honduras", house_number: "4000" })).toBe("Honduras 4000")
  })

  it("reads a pedestrian way, a footway, a path or a cycleway as the road", () => {
    for (const key of ["pedestrian", "footway", "path", "cycleway"]) {
      expect(composeAddress({ [key]: "Caminito", city: "Buenos Aires" }), key).toBe("Caminito, Buenos Aires")
    }
  })

  it("prefers the road over the other ways", () => {
    expect(composeAddress({ road: "Defensa", pedestrian: "Plaza Dorrego", city: "Buenos Aires" })).toBe("Defensa, Buenos Aires")
  })

  it("is neutral when there is no road: no address, not a made-up one", () => {
    expect(composeAddress({ suburb: "Palermo", city: "Buenos Aires" })).toBeNull()
    expect(composeAddress({ house_number: "12", city: "Junín" })).toBeNull()
    expect(composeAddress({})).toBeNull()
    expect(composeAddress(null)).toBeNull()
    expect(composeAddress(undefined)).toBeNull()
    expect(composeAddress({ road: 3 as never })).toBeNull()
  })

  it("does not say the same thing twice, and does not abbreviate anything but a leading Avenida", () => {
    expect(composeAddress({ road: "Junín", city: "Junín" })).toBe("Junín")
    expect(composeAddress({ road: "Avenida del Libertador", house_number: "2000", city: "Buenos Aires" })).toBe(
      "Av. del Libertador 2000, Buenos Aires",
    )
    expect(composeAddress({ road: "Pasaje Avenida", city: "Buenos Aires" })).toBe("Pasaje Avenida, Buenos Aires")
  })

  it("never returns more than 200 characters or control characters", () => {
    const long = composeAddress({ road: "x".repeat(300), house_number: "1", city: "y".repeat(300) })!
    expect([...long].length).toBeLessThanOrEqual(200)
    expect(composeAddress({ road: "Cal\u0000le", city: "Junín" })).toBe("Calle, Junín")
  })
})

describe("describePlace", () => {
  it("gives the name and the address together", () => {
    expect(describePlace({ road: "Honduras", house_number: "4000", suburb: "Palermo", city: "Buenos Aires" })).toEqual({
      label: "Palermo, Buenos Aires",
      address: "Honduras 4000, Buenos Aires",
    })
  })

  it("gives only what exists, and null when nothing does", () => {
    expect(describePlace({ suburb: "Palermo", city: "Buenos Aires" })).toEqual({ label: "Palermo, Buenos Aires", address: null })
    expect(describePlace({})).toBeNull()
    expect(describePlace(null)).toBeNull()
  })
})
