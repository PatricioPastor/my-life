import { describe, expect, it } from "vitest"
import { STAR_HEX } from "@/shared/lib/palette"
import { FACETS, FACET_ANCHORS, findFacet } from "./content"

describe("facets content", () => {
  it("hangs the four facets in the design's positions", () => {
    expect(FACETS.map((f) => [f.id, f.name, f.x, f.y])).toEqual([
      ["stories", "Historias", 0.21, 0.68],
      ["writing", "Escritos", 0.57, 0.79],
      ["projects", "Proyectos", 0.75, 0.45],
      ["now", "Ahora", 0.39, 0.29],
    ])
  })

  it("describes every facet in a short Spanish sentence", () => {
    expect(FACETS.map((f) => f.description)).toEqual([
      "Relatos de mi vida, en primera persona.",
      "Ideas, notas y ensayos.",
      "Cosas que construí y estoy construyendo.",
      "En qué estoy enfocado hoy.",
    ])
  })

  it("gives every facet three placeholder entries", () => {
    for (const f of FACETS) expect(f.entries).toHaveLength(3)
    expect(FACETS[2].entries[0]).toEqual({ meta: "[Rol, año]", title: "[Nombre del proyecto]" })
  })

  it("gives each facet its own ring color", () => {
    expect(FACETS.map((f) => [f.id, f.color])).toEqual([
      ["stories", "gold"],
      ["writing", "clay"],
      ["projects", "sandy"],
      ["now", "bronze"],
    ])
    expect(FACETS.map((f) => STAR_HEX[f.color])).toEqual(["#FFC15E", "#F7B05B", "#F7934C", "#CC5803"])
    expect(new Set(FACETS.map((f) => f.color)).size).toBe(FACETS.length)
  })

  it("hangs the sky anchors with the facet tint indices", () => {
    expect(FACET_ANCHORS).toEqual([
      { x: 0.21, y: 0.68, tint: 0 },
      { x: 0.57, y: 0.79, tint: 1 },
      { x: 0.75, y: 0.45, tint: 2 },
      { x: 0.39, y: 0.29, tint: 3 },
    ])
  })

  it("finds a facet by id", () => {
    expect(findFacet("now")?.name).toBe("Ahora")
    expect(findFacet("nope")).toBeUndefined()
    expect(findFacet(undefined)).toBeUndefined()
  })
})
