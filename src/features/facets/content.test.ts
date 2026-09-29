import { describe, expect, it } from "vitest"
import { FACETS, findFacet } from "./content"

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

  it("finds a facet by id", () => {
    expect(findFacet("now")?.name).toBe("Now")
    expect(findFacet("nope")).toBeUndefined()
    expect(findFacet(undefined)).toBeUndefined()
  })
})
