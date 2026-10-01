import { describe, expect, it } from "vitest"
import { FACETS } from "./content"
import { facetKeepOut } from "./facet-keep-out"

const proyectos = FACETS.find((f) => f.id === "projects")!

describe("facetKeepOut", () => {
  it("covers the star itself, with room for its hit target and the parallax shift", () => {
    const rect = facetKeepOut(proyectos, 1440, 900)
    const cx = proyectos.x * 1440
    const cy = (1 - proyectos.y) * 900
    expect(rect.left).toBeLessThanOrEqual(cx - 24 - 28)
    expect(rect.right).toBeGreaterThanOrEqual(cx + 24 + 28)
    expect(rect.top).toBeLessThanOrEqual(cy - 24 - 28)
    expect(rect.bottom).toBeGreaterThanOrEqual(cy + 24 + 28)
  })

  it("extends over the label on the side the label is drawn", () => {
    const wide = facetKeepOut(proyectos, 1440, 900)
    const cx = proyectos.x * 1440
    // On a desktop the label sits to the right of the star.
    expect(wide.right).toBeGreaterThan(cx + 44 + proyectos.name.length * 10)
    expect(wide.left).toBeGreaterThan(cx - 80)
  })

  it("flips to the left on a phone, where the label would cross the right edge", () => {
    const rect = facetKeepOut(proyectos, 390, 844)
    const cx = proyectos.x * 390
    expect(rect.left).toBeLessThan(cx - 44 - proyectos.name.length * 10)
    expect(rect.right).toBeLessThan(cx + 80)
  })

  it("is a valid rect for every facet", () => {
    for (const f of FACETS) {
      const r = facetKeepOut(f, 1280, 800)
      expect(r.right).toBeGreaterThan(r.left)
      expect(r.bottom).toBeGreaterThan(r.top)
    }
  })
})
