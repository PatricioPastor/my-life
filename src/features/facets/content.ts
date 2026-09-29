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
  entries: FacetEntry[]
}

// Placeholder copy from the design canvas; real content comes later.
export const FACETS: readonly Facet[] = [
  {
    id: "stories", name: "Stories", x: 0.21, y: 0.68,
    entries: [
      { meta: "[Year]", title: "[Story title]" },
      { meta: "[Year]", title: "[Story title]" },
      { meta: "[Year]", title: "[Story title]" },
    ],
  },
  {
    id: "writing", name: "Writing", x: 0.57, y: 0.79,
    entries: [
      { meta: "[Date]", title: "[Post title]" },
      { meta: "[Date]", title: "[Post title]" },
      { meta: "[Date]", title: "[Post title]" },
    ],
  },
  {
    id: "projects", name: "Projects", x: 0.75, y: 0.45,
    entries: [
      { meta: "[Role, year]", title: "[Project name]" },
      { meta: "[Role, year]", title: "[Project name]" },
      { meta: "[Role, year]", title: "[Project name]" },
    ],
  },
  {
    id: "now", name: "Now", x: 0.39, y: 0.29,
    entries: [
      { meta: "[Month]", title: "[Current focus]" },
      { meta: "[Month]", title: "[Next commitment]" },
      { meta: "[Month]", title: "[Reading or listening]" },
    ],
  },
]

/** The facets are the bright sparkles the sky hangs. */
export const FACET_ANCHORS = FACETS.map(({ x, y }) => ({ x, y }))

export function findFacet(id: string | undefined): Facet | undefined {
  return FACETS.find((f) => f.id === id)
}
