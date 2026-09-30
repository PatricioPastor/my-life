export type LabelSide = "left" | "right"

// Silkscreen at 12px with 0.08em tracking runs about 10px a glyph; err wide so it never clips.
const GLYPH_PX = 11
// The label starts 44px from the star and the parallax layer can shift it by about this much.
const LABEL_OFFSET_PX = 44
const EDGE_MARGIN_PX = 28

export function estimateLabelWidth(text: string): number {
  return text.length * GLYPH_PX
}

/** Labels sit right of their star; they flip left when they would cross the viewport's right edge. */
export function labelSide(anchorX: number, labelWidth: number, viewportWidth: number): LabelSide {
  const need = LABEL_OFFSET_PX + labelWidth + EDGE_MARGIN_PX
  const roomRight = viewportWidth - anchorX
  if (roomRight >= need) return "right"
  const roomLeft = anchorX
  if (roomLeft >= need) return "left"
  return roomLeft > roomRight ? "left" : "right"
}
