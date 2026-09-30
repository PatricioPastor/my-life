import { STAR_TINT, type StarColorKey } from "@/shared/lib/palette"

export interface FacetEntry {
  meta: string
  title: string
}

export interface Facet {
  id: string
  name: string
  /** Star position as 0..1 stage fractions, y up (the sky's convention). */
  x: number
  y: number
  /** Palette key for the star, its hover label and the place title. */
  color: StarColorKey
  entries: FacetEntry[]
}

// Placeholder copy from the design canvas; real content comes later.
export const FACETS: readonly Facet[] = [
  {
    id: "stories", name: "Stories", x: 0.21, y: 0.68, color: "periwinkle",
    entries: [
      { meta: "[Year]", title: "[Story title]" },
      { meta: "[Year]", title: "[Story title]" },
      { meta: "[Year]", title: "[Story title]" },
    ],
  },
  {
    id: "writing", name: "Writing", x: 0.57, y: 0.79, color: "ink",
    entries: [
      { meta: "[Date]", title: "[Post title]" },
      { meta: "[Date]", title: "[Post title]" },
      { meta: "[Date]", title: "[Post title]" },
    ],
  },
  {
    id: "projects", name: "Projects", x: 0.75, y: 0.45, color: "gold",
    entries: [
      { meta: "[Role, year]", title: "[Project name]" },
      { meta: "[Role, year]", title: "[Project name]" },
      { meta: "[Role, year]", title: "[Project name]" },
    ],
  },
  {
    id: "now", name: "Now", x: 0.39, y: 0.29, color: "periwinkle",
    entries: [
      { meta: "[Month]", title: "[Current focus]" },
      { meta: "[Month]", title: "[Next commitment]" },
      { meta: "[Month]", title: "[Reading or listening]" },
    ],
  },
]

/** The facets are the bright sparkles the sky hangs, each in its facet's star color. */
export const FACET_ANCHORS = FACETS.map(({ x, y, color }) => ({ x, y, tint: STAR_TINT[color] }))

export function findFacet(id: string | undefined): Facet | undefined {
  return FACETS.find((f) => f.id === id)
}
