import { describe, expect, it } from "vitest"
import type { Block } from "@/shared/content"
import { sectionsOf, slugOf } from "./sections"

const sub = (text: string): Block => ({ type: "subheading", text })
const para = (text: string): Block => ({ type: "paragraph", runs: [{ kind: "text", text }] })

describe("slugOf", () => {
  it("makes a readable id of a Spanish title: lowercase, no accents, words joined by hyphens", () => {
    expect(slugOf("Dónde está hoy")).toBe("donde-esta-hoy")
    expect(slugOf("Calidad, accesibilidad y costo")).toBe("calidad-accesibilidad-y-costo")
    expect(slugOf("La integración IoT")).toBe("la-integracion-iot")
    expect(slugOf("  ¿Por qué? ¡Así!  ")).toBe("por-que-asi")
    expect(slugOf("Año 2026")).toBe("ano-2026")
  })
})

describe("sectionsOf", () => {
  it("lists every subheading in order, with its title and where it is among the blocks", () => {
    const blocks = [para("Intro."), { type: "break" } as const, sub("El problema"), para("Uno."), sub("Arquitectura")]
    expect(sectionsOf(blocks)).toEqual([
      { id: "el-problema", title: "El problema", block: 2 },
      { id: "arquitectura", title: "Arquitectura", block: 4 },
    ])
  })

  it("keeps every id unique, numbering a title that repeats (or that collides with a numbered one)", () => {
    const ids = sectionsOf([sub("Notas"), sub("Notas 2"), sub("Notas"), sub("Notas")]).map((s) => s.id)
    expect(ids).toEqual(["notas", "notas-2", "notas-3", "notas-4"])
  })

  it("is stable: the same text always gives the same ids", () => {
    const blocks = [sub("El problema"), sub("Dónde está hoy")]
    expect(sectionsOf(blocks)).toEqual(sectionsOf([...blocks]))
  })

  it("names a title with no letters or digits by its place", () => {
    expect(sectionsOf([sub("¿?"), sub("—")]).map((s) => s.id)).toEqual(["seccion-1", "seccion-2"])
  })

  it("has no sections when the text has no subheading", () => {
    expect(sectionsOf([para("Solo texto.")])).toEqual([])
  })
})
