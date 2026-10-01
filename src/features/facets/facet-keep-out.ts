import type { Facet } from "./content"
import { estimateLabelWidth, labelSide } from "./label-side"

/** A screen-space box in CSS px (y down). */
export interface KeepOutRect {
  left: number
  top: number
  right: number
  bottom: number
}

// The hit target is 48px; the sky's parallax can shift a star by about this much on a desktop pointer.
const HIT_HALF_PX = 24
const SHIFT_PX = 34
// On a phone there is little room and almost no pointer parallax, so the berth is tighter.
const NARROW_VIEWPORT_PX = 640
const NARROW_SHIFT_PX = 8
// Where the label starts, measured from the star (see label-side).
const LABEL_OFFSET_PX = 44

/** The box a facet star owns on screen: the star with its hit target and parallax, and the label beside it. */
export function facetKeepOut(facet: Pick<Facet, "x" | "y" | "name">, width: number, height: number): KeepOutRect {
  const pad = HIT_HALF_PX + (width < NARROW_VIEWPORT_PX ? NARROW_SHIFT_PX : SHIFT_PX)
  const cx = facet.x * width
  const cy = (1 - facet.y) * height
  const labelWidth = estimateLabelWidth(facet.name)
  const side = labelSide(cx, labelWidth, width)
  return {
    left: side === "right" ? cx - pad : cx - LABEL_OFFSET_PX - labelWidth,
    right: side === "right" ? cx + LABEL_OFFSET_PX + labelWidth : cx + pad,
    top: cy - pad,
    bottom: cy + pad,
  }
}
