import type { Project } from "@/features/projects"
import type { SparkleAnchor } from "@/features/sky"
import type { FacetId } from "@/shared/analytics"
import type { Block } from "@/shared/content"
import { STAR_TINT, type StarColorKey } from "@/shared/lib/palette"

/** One of an entry's fields, set quietly under its title in the Reader. */
export interface FacetEntryDetail {
  label: string
  value: string
}

export interface FacetEntry {
  meta: string
  title: string
  details?: readonly FacetEntryDetail[]
  /** The entry's text. Placeholder entries have none, and the Reader shows its placeholder pages. */
  blocks?: readonly Block[]
  /** A logo (a site path to an SVG) the Reader shows in place of the title, which stays the heading's accessible name. */
  logo?: string
  /** A small mark (a site path to an SVG) set beside the title in the place list, as decoration: the title names it. */
  mark?: string
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
  /** Drawn off: a faint star and label that cannot be focused or opened. The work galaxy turns off all but Proyectos. */
  off?: boolean
}

// Placeholder copy from the design canvas; real content comes later. Proyectos already has it: its entries are the case
// studies in content/projects, fed in by facetsWithProjects.
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
    entries: [],
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

/** The facets are the bright sparkles the sky hangs, each in its facet's star color; an off facet hangs an off one. */
export function facetAnchors(facets: readonly Facet[]): SparkleAnchor[] {
  return facets.map(({ x, y, color, off }) => (off ? { x, y, tint: STAR_TINT[color], off } : { x, y, tint: STAR_TINT[color] }))
}

export const FACET_ANCHORS = facetAnchors(FACETS)

export function findFacet(id: string | undefined, facets: readonly Facet[] = FACETS): Facet | undefined {
  return facets.find((f) => f.id === id)
}

/**
 * A case study as a Proyectos entry: role and period as its meta (the design's "Rol, año"), its stack as a detail, and
 * its logo and mark when it has them.
 */
function projectEntry({ meta, blocks }: Project): FacetEntry {
  return {
    meta: `${meta.role}, ${meta.period}`,
    title: meta.title,
    details: [{ label: "Stack", value: meta.stack.join(" · ") }],
    blocks,
    ...(meta.logo !== undefined && { logo: meta.logo }),
    ...(meta.mark !== undefined && { mark: meta.mark }),
  }
}

/** The facets with Proyectos fed from the case studies, in the order given; the other facets keep their placeholders. */
export function facetsWithProjects(projects: readonly Project[]): readonly Facet[] {
  return FACETS.map((f) => (f.id === "projects" ? { ...f, entries: projects.map(projectEntry) } : f))
}

/** The work galaxy: the same stars in the same places, with every facet but Proyectos turned off. */
export function workFacets(facets: readonly Facet[]): readonly Facet[] {
  return facets.map((f) => (f.id === "projects" ? f : { ...f, off: true }))
}
