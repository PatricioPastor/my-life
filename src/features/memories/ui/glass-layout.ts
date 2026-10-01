import type { Point, Viewport } from "./camera"

/** The camera zoom the approach flies to: the orb is up close, and the glass opens out of it. */
export const OPEN_ZOOM = 2.4

const MIN_DIAMETER = 200
const MAX_DIAMETER = 640

export interface GlassLayout {
  /** The sphere's diameter, in CSS px. */
  diameter: number
  /** Where its center sits, as fractions of the viewport. The caption floats below and beside it. */
  anchor: Point
}

/**
 * How big the glass sphere is and where it sits, for a viewport. It is the same place the approach flies the orb to,
 * so the orb arrives exactly where the glass opens. On a phone it is narrower than the screen, with room under it
 * for the caption; on a desktop it is limited by the height.
 */
export function glassLayout(vp: Viewport): GlassLayout {
  const narrow = vp.width < 640
  const diameter = Math.round(
    Math.min(Math.max(Math.min(vp.width * (narrow ? 0.8 : 0.5), vp.height * (narrow ? 0.42 : 0.62)), MIN_DIAMETER), MAX_DIAMETER),
  )
  // Leave room under the sphere for the caption (about 150 px), and keep it clear of the close control above.
  const room = vp.height - diameter
  const above = narrow ? Math.max(room * 0.3, 72) : Math.max(room * 0.4, 56)
  return { diameter, anchor: { x: 0.5, y: Math.min((above + diameter / 2) / vp.height, 0.62) } }
}
