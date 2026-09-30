/** Glyphs for a ring line, by the direction the ring runs at that spot: flat, backslash, upright, slash. */
export const TANGENT_GLYPHS = ["-", "\\", "|", "/"] as const

/**
 * Which of TANGENT_GLYPHS follows a ring through a cell at offset (dx, dy) from the vanishing point
 * (screen coordinates, y down). The ring's tangent is perpendicular to the radius; its angle,
 * folded into 0..PI, falls in one of four 45 degree sectors.
 */
export function tangentIndex(dx: number, dy: number): number {
  const a = ((Math.atan2(dx, -dy) % Math.PI) + Math.PI) % Math.PI
  return Math.floor((a + Math.PI / 8) / (Math.PI / 4)) % 4
}

/** About the most cells the tunnel may draw per frame; the phone budget and the desktop ceiling. */
export const MAX_CELLS = 12000

export interface Grid {
  cw: number
  ch: number
  /** Glyph size in px. */
  font: number
}

/** A finer grid on desktop and a coarser one on a phone, grown only as far as needed to stay under MAX_CELLS. */
export function gridFor(width: number, height: number): Grid {
  const base = width < 640 ? { cw: 10, ch: 16, font: 15 } : { cw: 9, ch: 14, font: 13 }
  const cells = (Math.max(width, 1) / base.cw) * (Math.max(height, 1) / base.ch)
  const k = Math.max(1, Math.sqrt(cells / MAX_CELLS))
  return { cw: base.cw * k, ch: base.ch * k, font: Math.round(base.font * k * 2) / 2 }
}
