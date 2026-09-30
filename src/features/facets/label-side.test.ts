import { describe, expect, it } from "vitest"
import { FACETS } from "./content"
import { estimateLabelWidth, labelSide } from "./label-side"

describe("estimateLabelWidth", () => {
  it("grows with the text", () => {
    expect(estimateLabelWidth("Proyectos")).toBeGreaterThan(estimateLabelWidth("Ahora"))
  })
})

describe("labelSide", () => {
  it("keeps the label on the right when it fits", () => {
    expect(labelSide(100, 90, 1440)).toBe("right")
  })

  it("flips left when the label would cross the right edge", () => {
    expect(labelSide(292, 100, 390)).toBe("left")
  })

  it("stays right when neither side fits but the right has more room", () => {
    expect(labelSide(60, 400, 300)).toBe("right")
  })

  it("goes left when neither side fits but the left has more room", () => {
    expect(labelSide(250, 400, 300)).toBe("left")
  })

  it("flips only the facets that need it at 390px, and none on desktop", () => {
    const sides = (w: number) => FACETS.map((f) => labelSide(f.x * w, estimateLabelWidth(f.name), w))
    expect(sides(390)[2]).toBe("left")
    expect(sides(1440)).toEqual(["right", "right", "right", "right"])
  })
})
