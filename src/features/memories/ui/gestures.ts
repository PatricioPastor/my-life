import { MIN_ZOOM, zoomAbout, type Camera, type Point, type Viewport } from "./camera"

/** Pure reducers for the canvas gestures: drag, wheel, pinch, double tap and the keyboard. */

/** How far a pointer must travel before a press becomes a drag; below it, it is still a tap. */
export const DRAG_THRESHOLD = 6

export function exceedsDrag(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD
}

/** A drag moves the world with the pointer. */
export function dragStep(cam: Camera, dx: number, dy: number): Camera {
  return { x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom, zoom: cam.zoom }
}

const VELOCITY_BLEND = 0.35
/** The fastest a release can glide (px per second): a burst of events must not send the camera across the world. */
export const MAX_FLICK_SPEED = 4500

/** Folds one pointer move (`dx`, `dy` px in `dt` seconds) into a smoothed release velocity (px per second). */
export function sampleVelocity(prev: Point, dx: number, dy: number, dt: number): Point {
  if (!(dt > 0)) return prev
  const x = prev.x + (dx / dt - prev.x) * VELOCITY_BLEND
  const y = prev.y + (dy / dt - prev.y) * VELOCITY_BLEND
  const speed = Math.hypot(x, y)
  return speed > MAX_FLICK_SPEED ? { x: (x / speed) * MAX_FLICK_SPEED, y: (y / speed) * MAX_FLICK_SPEED } : { x, y }
}

// ---- wheel --------------------------------------------------------------------------------------------------

export interface WheelInput {
  deltaY: number
  /** 0 pixels, 1 lines, 2 pages. */
  deltaMode: number
  /** A trackpad pinch arrives as a wheel event with ctrl held. */
  ctrlKey: boolean
}

const LINE_PX = 16
const PAGE_PX = 400
const WHEEL_ZOOM_PER_PX = 0.0018
const PINCH_ZOOM_PER_PX = 0.012
/** One event never zooms by more than about this factor (ln 2, a little under). */
const MAX_WHEEL_LN = 0.69

/** The zoom factor of one wheel event: above 1 zooms in (scrolling up). Reversible, and capped per event. */
export function wheelFactor(input: WheelInput): number {
  const px = input.deltaMode === 1 ? input.deltaY * LINE_PX : input.deltaMode === 2 ? input.deltaY * PAGE_PX : input.deltaY
  const ln = -px * (input.ctrlKey ? PINCH_ZOOM_PER_PX : WHEEL_ZOOM_PER_PX)
  return Math.exp(Math.min(Math.max(ln, -MAX_WHEEL_LN), MAX_WHEEL_LN))
}

export function wheelZoom(cam: Camera, vp: Viewport, point: Point, input: WheelInput, minZoom = MIN_ZOOM): Camera {
  return zoomAbout(cam, vp, point, wheelFactor(input), minZoom)
}

// ---- pinch --------------------------------------------------------------------------------------------------

export interface PinchPair {
  a: Point
  b: Point
}

const mid = (p: PinchPair): Point => ({ x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 })
const gap = (p: PinchPair) => Math.hypot(p.a.x - p.b.x, p.a.y - p.b.y)

/**
 * Two fingers moved from `prev` to `next`: the zoom follows the ratio of their distance, and the world point that was
 * under their middle stays under it (so moving both fingers together pans).
 */
export function pinchStep(cam: Camera, vp: Viewport, prev: PinchPair, next: PinchPair, minZoom = MIN_ZOOM): Camera {
  const before = gap(prev)
  if (before < 1e-6) return cam
  const zoom = Math.min(Math.max(cam.zoom * (gap(next) / before), minZoom), 3)
  const from = mid(prev)
  const to = mid(next)
  const worldX = (from.x - vp.width / 2) / cam.zoom + cam.x
  const worldY = (from.y - vp.height / 2) / cam.zoom + cam.y
  return { x: worldX - (to.x - vp.width / 2) / zoom, y: worldY - (to.y - vp.height / 2) / zoom, zoom }
}

// ---- double tap ---------------------------------------------------------------------------------------------

export const DOUBLE_TAP_MS = 320
const DOUBLE_TAP_PX = 32

export interface Tap {
  t: number
  x: number
  y: number
}

export function isDoubleTap(prev: Tap | null, next: Tap): boolean {
  return prev !== null && next.t - prev.t <= DOUBLE_TAP_MS && Math.hypot(next.x - prev.x, next.y - prev.y) <= DOUBLE_TAP_PX
}

// ---- keyboard -----------------------------------------------------------------------------------------------

export type KeyAction = { type: "pan"; dx: number; dy: number } | { type: "zoom"; factor: number } | { type: "fit" }

const PAN_STEP_PX = 96
const KEY_ZOOM = 1.25

/** What a key does to the camera while the space has focus, or null. A pan is the drag-like delta of the world. */
export function keyAction(key: string): KeyAction | null {
  switch (key) {
    case "ArrowLeft":
      return { type: "pan", dx: PAN_STEP_PX, dy: 0 }
    case "ArrowRight":
      return { type: "pan", dx: -PAN_STEP_PX, dy: 0 }
    case "ArrowUp":
      return { type: "pan", dx: 0, dy: PAN_STEP_PX }
    case "ArrowDown":
      return { type: "pan", dx: 0, dy: -PAN_STEP_PX }
    case "+":
    case "=":
      return { type: "zoom", factor: KEY_ZOOM }
    case "-":
    case "_":
      return { type: "zoom", factor: 1 / KEY_ZOOM }
    case "0":
      return { type: "fit" }
    default:
      return null
  }
}
