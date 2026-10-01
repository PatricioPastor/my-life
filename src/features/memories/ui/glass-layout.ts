import type { Point, Viewport } from "./camera"

/** The camera zoom the approach flies to: the orb is up close, and the glass opens out of it. */
export const OPEN_ZOOM = 2.4

const MIN_DIAMETER = 200
const MAX_DIAMETER = 640
/** Under this height the caption has no room below the sphere and moves beside it (a phone in landscape). */
const SHORT_HEIGHT = 520
const SIDE_MIN_DIAMETER = 150
/** Room kept above the sphere for the close control, and under it for the play control that hangs off its rim. */
const SIDE_TOP = 56
const SIDE_BOTTOM = 56

export interface GlassLayout {
  /** The sphere's diameter, in CSS px. */
  diameter: number
  /** Where its center sits, as fractions of the viewport. */
  anchor: Point
  /** Where the caption, date and place float: under the sphere, or in a column beside it on short screens. */
  caption: "below" | "side"
}

/**
 * How big the glass sphere is and where it sits, for a viewport. It is the same place the approach flies the orb to,
 * so the orb arrives exactly where the glass opens. On a phone it is narrower than the screen, with room under it
 * for the caption; on a desktop it is limited by the height; on a short, wide screen the caption goes beside it.
 */
export function glassLayout(vp: Viewport): GlassLayout {
  if (vp.height < SHORT_HEIGHT && vp.width > vp.height * 1.3) {
    const diameter = Math.max(Math.min(vp.height - SIDE_TOP - SIDE_BOTTOM, vp.width * 0.4), SIDE_MIN_DIAMETER)
    const top = SIDE_TOP + (vp.height - SIDE_TOP - SIDE_BOTTOM - diameter) / 2
    return { diameter: Math.round(diameter), anchor: { x: 0.32, y: (top + diameter / 2) / vp.height }, caption: "side" }
  }
  const narrow = vp.width < 640
  const diameter = Math.round(
    Math.min(Math.max(Math.min(vp.width * (narrow ? 0.8 : 0.5), vp.height * (narrow ? 0.42 : 0.62)), MIN_DIAMETER), MAX_DIAMETER),
  )
  // Leave room under the sphere for the caption (about 150 px), and keep it clear of the close control above.
  const room = vp.height - diameter
  const above = narrow ? Math.max(room * 0.3, 72) : Math.max(room * 0.4, 56)
  return { diameter, anchor: { x: 0.5, y: Math.min((above + diameter / 2) / vp.height, 0.62) }, caption: "below" }
}
