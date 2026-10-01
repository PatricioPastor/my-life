import { FACETS, facetKeepOut, type KeepOutRect } from "@/features/facets"

interface Planet {
  /** 0..1 stage fractions, y up, as the sky shader reads them. */
  x: number
  y: number
  /** Fraction of the short side. */
  radius: number
}

// The name mark (top-10 left-12) and the replay control (bottom-7 left-9) as they sit on screen.
const NAME_MARK: KeepOutRect = { left: 0, top: 0, right: 210, bottom: 64 }
const CONTROLS_WIDTH = 170
const CONTROLS_HEIGHT = 84

/**
 * Everything the memory orb must keep clear of while it floats over the sky: the facet stars with their
 * labels, the name mark, the bottom controls and the planet. Boxes in CSS px, y down.
 */
export function skyKeepOut(width: number, height: number, planet?: Planet): KeepOutRect[] {
  const boxes: KeepOutRect[] = [
    ...FACETS.map((f) => facetKeepOut(f, width, height)),
    NAME_MARK,
    { left: 0, top: height - CONTROLS_HEIGHT, right: CONTROLS_WIDTH, bottom: height },
  ]
  if (planet) {
    const cx = planet.x * width
    const cy = (1 - planet.y) * height
    const r = planet.radius * Math.min(width, height)
    boxes.push({ left: cx - r, top: cy - r, right: cx + r, bottom: cy + r })
  }
  return boxes
}
