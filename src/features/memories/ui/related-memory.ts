import { truncateCaption } from "../format"
import type { MemoryPlace, MemoryView } from "../memory-view"
import { coordinatesLabel } from "./place-model"

/** What the form knows about the memory it is contributed from: enough to prefill and to say what it is related to. */
export interface RelatedMemory {
  id: string
  caption: string
  /** `YYYY-MM-DD`: the form's date starts here, and the visitor can change it. */
  happenedOn: string
  /** The place as one line to show next to "Mismo lugar" (the position itself never reaches the form), or null. */
  place: string | null
}

/** The copy of a contribution that starts from a memory (neutral Spanish, `tú`). */
export const RELATED_COPY = {
  title: "Contribuir con un recuerdo",
  description: "Una foto, un audio o ambos. Tu recuerdo aparecerá en el espacio cuando sea aprobado.",
  removeRelation: "Quitar relación",
  sameLabel: "Mismo lugar",
} as const

/** The longest caption the chip shows before it shortens it. */
const CHIP_CAPTION_MAX = 40

/** "Relacionado con «La casa nueva»": the chip that says what the new memory is related to. */
export const chipText = (caption: string) => `Relacionado con «${truncateCaption(caption, CHIP_CAPTION_MAX)}»`

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * The place as one line: the name, then the street address when it adds something; the coarse position when it has
 * neither; null without a place. The exact position is not here, and never reaches the browser.
 */
export function placeLine(place: MemoryPlace | null): string | null {
  if (!place) return null
  const parts = [place.name, place.address].filter((part): part is string => part !== null && part.trim() !== "")
  const unique = parts.filter((part, index) => parts.findIndex((other) => same(other, part)) === index)
  return unique.length > 0 ? unique.join(" · ") : coordinatesLabel(place.lat, place.lng)
}

export function relatedFrom(memory: MemoryView): RelatedMemory {
  return { id: memory.id, caption: memory.caption, happenedOn: memory.happenedOn, place: placeLine(memory.place) }
}
