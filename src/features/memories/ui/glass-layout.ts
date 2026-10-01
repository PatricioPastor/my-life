import type { Point, Viewport } from "./camera"
import { CANVAS_SCALE } from "./glass-mode"

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

/** The lens canvas draws at the screen's own density, up to this (a single canvas, so it can afford it). */
export const LENS_MAX_DPR = 3

export interface LensGeometry {
  /** The density the lens draws at: the device ratio, 1 to {@link LENS_MAX_DPR}. */
  dpr: number
  /** The sphere's diameter in CSS px: a whole, even number of device pixels. */
  diameter: number
  /** The sphere's center in CSS px, on a whole device pixel. */
  center: Point
  /** The center as fractions of the viewport: where the camera puts the orb it flies to. */
  anchor: Point
  /** The canvas around the sphere (room for its rim): square, device-aligned, its backing store exactly `device` px. */
  canvas: { device: number; css: number; left: number; top: number }
  caption: GlassLayout["caption"]
}

/**
 * The glass layout snapped to the device pixel grid. The sphere's edges, its center and the canvas around it all land
 * on whole device pixels and the canvas backing store matches its CSS size exactly, so the compositor never resamples
 * the lens (no soft edge, no blur) and the orb the camera flies to lands on the very pixel the sphere opens on.
 */
export function lensGeometry(vp: Viewport, devicePixelRatio: number): LensGeometry {
  const dpr = Math.min(Math.max(Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1, 1), LENS_MAX_DPR)
  const layout = glassLayout(vp)
  const deviceDiameter = 2 * Math.round((layout.diameter * dpr) / 2)
  const diameter = deviceDiameter / dpr
  const center = {
    x: Math.round(layout.anchor.x * vp.width * dpr) / dpr,
    y: Math.round(layout.anchor.y * vp.height * dpr) / dpr,
  }
  const margin = Math.ceil((deviceDiameter * (CANVAS_SCALE - 1)) / 2)
  const device = deviceDiameter + 2 * margin
  const css = device / dpr
  return {
    dpr,
    diameter,
    center,
    anchor: { x: center.x / vp.width, y: center.y / vp.height },
    canvas: { device, css, left: center.x - css / 2, top: center.y - css / 2 },
    caption: layout.caption,
  }
}
