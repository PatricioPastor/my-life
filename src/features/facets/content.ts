import type { FacetId } from "@/shared/analytics"
import { STAR_TINT, type StarColorKey } from "@/shared/lib/palette"

export interface FacetEntry {
  meta: string
  title: string
}

export interface Facet {
  id: FacetId
  name: string
  /** Editable placeholder: the sentence the cursor panel reveals with Ctrl, and what assistive tech reads. */
  description: string
  /** Star position as 0..1 stage fractions, y up (the sky's convention). */
  x: number
  y: number
  /** Star color key (a portal ring color) for the star, its hover label and the place title. */
  color: StarColorKey
  entries: FacetEntry[]
}

// Placeholder copy from the design canvas; real content comes later.
export const FACETS: readonly Facet[] = [
  {
    id: "stories", name: "Historias", description: "Relatos de mi vida, en primera persona.", x: 0.21, y: 0.68, color: "gold",
    entries: [
      { meta: "[Año]", title: "[Título de la historia]" },
      { meta: "[Año]", title: "[Título de la historia]" },
      { meta: "[Año]", title: "[Título de la historia]" },
    ],
  },
  {
    id: "writing", name: "Escritos", description: "Ideas, notas y ensayos.", x: 0.57, y: 0.79, color: "clay",
    entries: [
      { meta: "[Fecha]", title: "[Título del escrito]" },
      { meta: "[Fecha]", title: "[Título del escrito]" },
      { meta: "[Fecha]", title: "[Título del escrito]" },
    ],
  },
  {
    id: "projects", name: "Proyectos", description: "Cosas que construí y estoy construyendo.", x: 0.75, y: 0.45, color: "sandy",
    entries: [
      { meta: "[Rol, año]", title: "[Nombre del proyecto]" },
      { meta: "[Rol, año]", title: "[Nombre del proyecto]" },
      { meta: "[Rol, año]", title: "[Nombre del proyecto]" },
    ],
  },
  {
    id: "now", name: "Ahora", description: "En qué estoy enfocado hoy.", x: 0.39, y: 0.29, color: "bronze",
    entries: [
      { meta: "[Mes]", title: "[Foco actual]" },
      { meta: "[Mes]", title: "[Próximo compromiso]" },
      { meta: "[Mes]", title: "[Leyendo o escuchando]" },
    ],
  },
]

/** The facets are the bright sparkles the sky hangs, each in its facet's star color. */
export const FACET_ANCHORS = FACETS.map(({ x, y, color }) => ({ x, y, tint: STAR_TINT[color] }))

export function findFacet(id: string | undefined): Facet | undefined {
  return FACETS.find((f) => f.id === id)
}
