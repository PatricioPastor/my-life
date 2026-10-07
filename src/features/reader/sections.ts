import type { Block } from "@/shared/content"

/** A section of a case study's text: it starts at a subheading. */
export interface Section {
  /** The subheading's id, readable and unique in the text: what the index links to. */
  id: string
  title: string
  /** Where its subheading is among the blocks. */
  block: number
}

/** A readable id for a title: lowercase, without accents, its words joined by hyphens ("Dónde está hoy": "donde-esta-hoy"). */
export function slugOf(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * The text's sections, in order, one per subheading. Each id comes from its title alone, so it is the same on every
 * render and on every visit; a title used again is numbered, and one with nothing to spell is named by its place.
 */
export function sectionsOf(blocks: readonly Block[]): Section[] {
  const used = new Set<string>()
  const sections: Section[] = []
  blocks.forEach((block, i) => {
    if (block.type !== "subheading") return
    const base = slugOf(block.text) || `seccion-${sections.length + 1}`
    let id = base
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`
    used.add(id)
    sections.push({ id, title: block.text, block: i })
  })
  return sections
}
