import { summonEase } from "@/features/orb/orb-summon"
import type { Box } from "./point-layout"

/**
 * The memories canvas camera, in pure math. `x` and `y` are the world point at the middle of the viewport, `zoom` is
 * screen px per world px. Nothing here touches the DOM: the loop that moves orbs reads a camera and calls these.
 */
export interface Camera {
  x: number
  y: number
  zoom: number
}

export interface Viewport {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** World bounds, in world px (y down). */
export type Bounds = Box

export interface Padding {
  top: number
  right: number
  bottom: number
  left: number
}

export const MIN_ZOOM = 0.35
export const MAX_ZOOM = 3
/** A tiny constellation is not blown up past this when it is fitted. */
export const FIT_MAX_ZOOM = 1.15

export function worldToScreen(cam: Camera, vp: Viewport, p: Point): Point {
  return { x: (p.x - cam.x) * cam.zoom + vp.width / 2, y: (p.y - cam.y) * cam.zoom + vp.height / 2 }
}

export function screenToWorld(cam: Camera, vp: Viewport, p: Point): Point {
  return { x: (p.x - vp.width / 2) / cam.zoom + cam.x, y: (p.y - vp.height / 2) / cam.zoom + cam.y }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** Multiplies the zoom by `factor` about a screen point, so the world point under it does not move. */
export function zoomAbout(cam: Camera, vp: Viewport, screenPoint: Point, factor: number, minZoom = MIN_ZOOM): Camera {
  const zoom = clamp(cam.zoom * factor, minZoom, MAX_ZOOM)
  const world = screenToWorld(cam, vp, screenPoint)
  return { x: world.x - (screenPoint.x - vp.width / 2) / zoom, y: world.y - (screenPoint.y - vp.height / 2) / zoom, zoom }
}

/** Moves the camera against a drag of `dx`, `dy` screen px. */
export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom, zoom: cam.zoom }
}

// ---- inertia ------------------------------------------------------------------------------------------------

/** Velocity decay per second: about 0.2 s to lose half of it, so a flick glides a little and stops. */
const INERTIA_DECAY_PER_S = 3.4
/** Below this (screen px per second) the glide is over. */
const INERTIA_STOP = 8

/** One decay step of a drag velocity (screen px per second). Exact for any frame rate; ends at exactly zero. */
export function inertiaStep(v: Point, dt: number): Point {
  const k = Math.exp(-INERTIA_DECAY_PER_S * dt)
  const x = v.x * k
  const y = v.y * k
  return Math.hypot(x, y) < INERTIA_STOP ? { x: 0, y: 0 } : { x, y }
}

/** Moves the camera as if the world followed a finger moving at `v` screen px per second for `dt` seconds. */
export function applyVelocity(cam: Camera, v: Point, dt: number): Camera {
  return panBy(cam, v.x * dt, v.y * dt)
}

// ---- bounds -------------------------------------------------------------------------------------------------

/** The camera center clamped into the world rectangle. */
export function clampCamera(cam: Camera, bounds: Bounds): Camera {
  return { x: clamp(cam.x, bounds.left, bounds.right), y: clamp(cam.y, bounds.top, bounds.bottom), zoom: cam.zoom }
}

/** One axis of a pan: free inside `[lo, hi]`, stiffer and stiffer outside it, and never more than `slack` out. */
function resistAxis(value: number, delta: number, lo: number, hi: number, slack: number): number {
  const next = value + delta
  if (next >= lo && next <= hi) return next
  const dir = next < lo ? -1 : 1
  const edge = dir < 0 ? lo : hi
  const depthNow = Math.max(dir * (value - edge), 0)
  // Coming back toward the world is never resisted.
  if (dir * delta <= 0) return next
  const wanted = dir * (next - edge) - depthNow
  const resisted = Math.max(wanted, 0) * (1 - Math.min(depthNow / slack, 1)) ** 2
  return edge + dir * Math.min(depthNow + resisted, slack)
}

/** A drag that may go a little past the world's edge, with growing resistance (the soft edge). */
export function panWithResistance(cam: Camera, dx: number, dy: number, bounds: Bounds, slack: number): Camera {
  return {
    x: resistAxis(cam.x, -dx / cam.zoom, bounds.left, bounds.right, slack),
    y: resistAxis(cam.y, -dy / cam.zoom, bounds.top, bounds.bottom, slack),
    zoom: cam.zoom,
  }
}

const RELAX_PER_S = 8
const RELAX_SNAP = 0.01

/** Eases a camera that was dragged past the edge back inside it. Returns the same object when nothing is to do. */
export function relaxCamera(cam: Camera, bounds: Bounds, dt: number): Camera {
  const target = clampCamera(cam, bounds)
  if (target.x === cam.x && target.y === cam.y) return cam
  const k = 1 - Math.exp(-RELAX_PER_S * dt)
  const ease = (from: number, to: number) => (Math.abs(to - from) < RELAX_SNAP ? to : from + (to - from) * k)
  return { x: ease(cam.x, target.x), y: ease(cam.y, target.y), zoom: cam.zoom }
}

// ---- the world ----------------------------------------------------------------------------------------------

/** World px² of room per memory: about what the constellation used on screen before the canvas. */
const AREA_PER_MEMORY = 55000
/** Even a nearly empty space is a room, not a closet. */
const MIN_COUNT = 12
const MIN_ASPECT = 0.6
const MAX_ASPECT = 1.8

/**
 * The world rectangle for `count` memories: its area grows with the count, so each side grows with the square root,
 * and its shape follows the viewport it was first seen on (a tall phone gets a tall world). It starts at 0, 0.
 */
export function worldBounds(count: number, aspect: number): Bounds {
  const shape = clamp(Number.isFinite(aspect) && aspect > 0 ? aspect : 1.6, MIN_ASPECT, MAX_ASPECT)
  const area = AREA_PER_MEMORY * Math.max(count, MIN_COUNT)
  const width = Math.sqrt(area * shape)
  return { left: 0, top: 0, right: width, bottom: width / shape }
}

/**
 * The camera that shows a world box as large as fits inside the viewport minus `pad`, centered in what is left.
 * It never goes below `minZoom` (which may be lower than the usual floor for a huge world) nor above a cap.
 */
export function fitBounds(box: Bounds, vp: Viewport, pad: Padding, minZoom = MIN_ZOOM): Camera {
  const boxW = Math.max(box.right - box.left, 1)
  const boxH = Math.max(box.bottom - box.top, 1)
  const availW = Math.max(vp.width - pad.left - pad.right, 1)
  const availH = Math.max(vp.height - pad.top - pad.bottom, 1)
  const zoom = clamp(Math.min(availW / boxW, availH / boxH), minZoom, FIT_MAX_ZOOM)
  const areaX = pad.left + availW / 2
  const areaY = pad.top + availH / 2
  return {
    x: (box.left + box.right) / 2 - (areaX - vp.width / 2) / zoom,
    y: (box.top + box.bottom) / 2 - (areaY - vp.height / 2) / zoom,
    zoom,
  }
}

/** The lowest zoom allowed for a world: the usual floor, or lower when the whole world needs it to fit. */
export function minZoomFor(box: Bounds, vp: Viewport, pad: Padding): number {
  const boxW = Math.max(box.right - box.left, 1)
  const boxH = Math.max(box.bottom - box.top, 1)
  const fit = Math.min(Math.max(vp.width - pad.left - pad.right, 1) / boxW, Math.max(vp.height - pad.top - pad.bottom, 1) / boxH)
  return Math.min(MIN_ZOOM, fit)
}

/** The camera that puts a world point at `anchor` (fractions of the viewport) at the given zoom. */
export function focusCamera(world: Point, vp: Viewport, zoom: number, anchor: Point = { x: 0.5, y: 0.5 }): Camera {
  return {
    x: world.x - (anchor.x * vp.width - vp.width / 2) / zoom,
    y: world.y - (anchor.y * vp.height - vp.height / 2) / zoom,
    zoom,
  }
}

// ---- flights ------------------------------------------------------------------------------------------------

const FLIGHT_MIN_S = 0.9
const FLIGHT_MAX_S = 1.4
/** The traveled distance (screen px, counting zoom as distance) at which a flight takes the longest. */
const FLIGHT_FAR_PX = 6000
/** A change of zoom by a factor `e` counts as this many px per unit of ln(zoom ratio). */
const ZOOM_PX_PER_LN = 420

/** How long a flight takes, 0.9 to 1.4 s, longer the farther it goes (distance counted on screen, zoom included). */
export function flightDuration(from: Camera, to: Camera): number {
  const reach = Math.hypot(to.x - from.x, to.y - from.y) * ((from.zoom + to.zoom) / 2)
  const dive = Math.abs(Math.log(to.zoom / from.zoom)) * ZOOM_PX_PER_LN
  return FLIGHT_MIN_S + (FLIGHT_MAX_S - FLIGHT_MIN_S) * Math.min((reach + dive) / FLIGHT_FAR_PX, 1)
}

/**
 * The camera `u` (0..1) of the way through a flight, on the same curve as the summon of the orb on the sky,
 * `cubic-bezier(0.7, 0, 0.2, 1)`: slow to get going, fast through the middle, settling flat at the end. The center
 * moves linearly and the zoom evenly in its logarithm. It starts and ends exactly on the cameras it is given.
 */
export function flightAt(from: Camera, to: Camera, u: number): Camera {
  if (!(u > 0)) return { ...from }
  if (u >= 1) return { ...to }
  const e = summonEase(u)
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
    zoom: from.zoom * (to.zoom / from.zoom) ** e,
  }
}

// ---- depth --------------------------------------------------------------------------------------------------

/**
 * How far a layer at `depth` (0 = infinitely far and still, 1 = moves with the world) is shifted on screen, in px, for
 * a camera that has moved away from `home`. It moves against the camera, and far layers move less.
 */
export function parallaxOffset(cam: Camera, home: Camera, depth: number): Point {
  return { x: (home.x - cam.x) * cam.zoom * depth, y: (home.y - cam.y) * cam.zoom * depth }
}

// ---- short moves and how big an orb draws ----------------------------------------------------------------------

/** A short move (a key press, a double tap): fast out of the gate, easing to a stop, exact at both ends. */
export function settleAt(from: Camera, to: Camera, u: number): Camera {
  if (!(u > 0)) return { ...from }
  if (u >= 1) return { ...to }
  const e = 1 - (1 - u) ** 3
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
    zoom: from.zoom * (to.zoom / from.zoom) ** e,
  }
}

const ORB_SCALE_MIN = 0.7
const ORB_SCALE_MAX = 2.2
const ORB_SCALE_POWER = 0.6

/** How much bigger (or smaller) an orb is drawn at a zoom: it grows with the zoom, but slower than the world does. */
export function orbScale(zoom: number): number {
  return clamp(zoom ** ORB_SCALE_POWER, ORB_SCALE_MIN, ORB_SCALE_MAX)
}

const FOCUS_FROM_ZOOM = 1.1

/** 0..1: how far the camera has come in on the orb it is approaching (0 while far, 1 once it has arrived). */
export function focusAmount(zoom: number, openZoom: number): number {
  const t = clamp((zoom - FOCUS_FROM_ZOOM) / Math.max(openZoom - FOCUS_FROM_ZOOM, 1e-6), 0, 1)
  return t * t * (3 - 2 * t)
}
