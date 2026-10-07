import { describe, expect, it } from "vitest"
import { PROJECT } from "@/features/projects/project-fixture"
import { STAR_HEX } from "@/shared/lib/palette"
import { FACETS, FACET_ANCHORS, facetAnchors, facetsWithProjects, findFacet, workFacets } from "./content"

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

  it("gives every facet but Proyectos three placeholder entries; Proyectos is fed from the case studies", () => {
    for (const f of FACETS) expect(f.entries).toHaveLength(f.id === "projects" ? 0 : 3)
    expect(FACETS[0].entries[0]).toEqual({ meta: "[Año]", title: "[Título de la historia]" })
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

  it("finds a facet among the ones given", () => {
    const facets = facetsWithProjects([PROJECT])
    expect(findFacet("projects", facets)?.entries).toHaveLength(1)
  })
})

describe("facetsWithProjects", () => {
  const second = { ...PROJECT, meta: { ...PROJECT.meta, slug: "otra", title: "Otra consola", role: "Desarrollo", period: "2024–2025", order: 2 } }

  it("feeds Proyectos with one entry per case study, in the order given", () => {
    const projects = facetsWithProjects([PROJECT, second]).find((f) => f.id === "projects")!
    expect(projects.entries.map((e) => e.title)).toEqual(["Consola de prueba", "Otra consola"])
  })

  it("reads a project's role and period as the entry meta, its summary, its stack as a detail and its text as the blocks", () => {
    const [entry] = facetsWithProjects([PROJECT]).find((f) => f.id === "projects")!.entries
    expect(entry).toEqual({
      meta: "Diseño y desarrollo, 2026",
      title: "Consola de prueba",
      summary: "Una consola de prueba.",
      details: [{ label: "Stack", value: "Next.js 16 · React 19" }],
      blocks: PROJECT.blocks,
    })
  })

  it("carries a project's logo and mark, as the site paths it gives", () => {
    const branded = { ...PROJECT, meta: { ...PROJECT.meta, logo: "/projects/consola/logo.svg", mark: "/projects/consola/mark.svg" } }
    const [entry] = facetsWithProjects([branded]).find((f) => f.id === "projects")!.entries
    expect(entry.logo).toBe("/projects/consola/logo.svg")
    expect(entry.mark).toBe("/projects/consola/mark.svg")
  })

  it("gives a project with neither no logo and no mark: its name stays text", () => {
    const [entry] = facetsWithProjects([PROJECT]).find((f) => f.id === "projects")!.entries
    expect("logo" in entry).toBe(false)
    expect("mark" in entry).toBe(false)
  })

  it("leaves the other facets as they are, and every star where it hangs", () => {
    const facets = facetsWithProjects([PROJECT])
    expect(facets.filter((f) => f.id !== "projects")).toEqual(FACETS.filter((f) => f.id !== "projects"))
    expect(facets.map(({ id, name, x, y, color }) => [id, name, x, y, color])).toEqual(
      FACETS.map(({ id, name, x, y, color }) => [id, name, x, y, color]),
    )
  })
})

describe("workFacets", () => {
  it("keeps Proyectos lit, with its case studies, and turns every other facet off", () => {
    const facets = workFacets(facetsWithProjects([PROJECT]))
    expect(facets.map((f) => [f.id, f.off === true])).toEqual([
      ["stories", true],
      ["writing", true],
      ["projects", false],
      ["now", true],
    ])
    expect(findFacet("projects", facets)?.entries.map((e) => e.title)).toEqual(["Consola de prueba"])
  })

  it("hangs the off stars where they always hang: it is the same galaxy", () => {
    expect(workFacets(FACETS).map(({ id, name, x, y, color }) => [id, name, x, y, color])).toEqual(
      FACETS.map(({ id, name, x, y, color }) => [id, name, x, y, color]),
    )
  })

  it("never lights anything in the story: no facet there is off", () => {
    expect(FACETS.some((f) => f.off)).toBe(false)
  })
})

describe("facetAnchors", () => {
  it("hangs one anchor per facet, and marks the off ones", () => {
    expect(facetAnchors(workFacets(FACETS))).toEqual([
      { x: 0.21, y: 0.68, tint: 0, off: true },
      { x: 0.57, y: 0.79, tint: 1, off: true },
      { x: 0.75, y: 0.45, tint: 2 },
      { x: 0.39, y: 0.29, tint: 3, off: true },
    ])
  })

  it("is what the story hangs: every anchor lit", () => {
    expect(facetAnchors(FACETS)).toStrictEqual(FACET_ANCHORS)
    expect(FACET_ANCHORS.some((a) => "off" in a)).toBe(false)
  })
})
