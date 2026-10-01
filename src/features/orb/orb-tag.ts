export type OrbTagSide = "left" | "right"

/** Silkscreen at 12px with 0.08em tracking runs about 10px a glyph; err wide so the label never clips. */
export const TAG_WIDTH_PX = "Agregar recuerdo".length * 11
// The label starts this far from the orb's centre, and the viewport edge keeps this margin.
const TAG_OFFSET_PX = 40
const EDGE_MARGIN_PX = 16

/** The label that names the orb for visitors with no hover (touch) sits beside it, on the side with room. */
export function orbTagSide(orbX: number, viewportWidth: number): OrbTagSide {
  const need = TAG_OFFSET_PX + TAG_WIDTH_PX + EDGE_MARGIN_PX
  const roomRight = viewportWidth - orbX
  if (roomRight >= need) return "right"
  if (orbX >= need) return "left"
  return orbX > roomRight ? "left" : "right"
}
