import { describe, expect, it } from "vitest"
import { FACETS, FACET_ANCHORS, findFacet } from "./content"

describe("facets content", () => {
  it("hangs the four facets in the design's positions", () => {
    expect(FACETS.map((f) => [f.id, f.name, f.x, f.y])).toEqual([
      ["stories", "Stories", 0.21, 0.68],
      ["writing", "Writing", 0.57, 0.79],
      ["projects", "Projects", 0.75, 0.45],
      ["now", "Now", 0.39, 0.29],
    ])
  })

  it("gives every facet three placeholder entries", () => {
    for (const f of FACETS) expect(f.entries).toHaveLength(3)
    expect(FACETS[2].entries[0]).toEqual({ meta: "[Role, year]", title: "[Project name]" })
  })

  it("colors each facet star from the palette", () => {
    expect(FACETS.map((f) => [f.id, f.color])).toEqual([
      ["stories", "periwinkle"],
      ["writing", "ink"],
      ["projects", "gold"],
      ["now", "periwinkle"],
    ])
  })

  it("hangs the sky anchors with the facet tint indices", () => {
    expect(FACET_ANCHORS).toEqual([
      { x: 0.21, y: 0.68, tint: 2 },
      { x: 0.57, y: 0.79, tint: 1 },
      { x: 0.75, y: 0.45, tint: 0 },
      { x: 0.39, y: 0.29, tint: 2 },
    ])
  })

  it("finds a facet by id", () => {
    expect(findFacet("now")?.name).toBe("Now")
    expect(findFacet("nope")).toBeUndefined()
    expect(findFacet(undefined)).toBeUndefined()
  })
})
