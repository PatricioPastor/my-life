import { distanceToRect, type Point, type Rect } from "./orb-path"

/**
 * Summoning the orb to the cursor: the pure pieces. A time-based flight profile, how long it takes, where it
 * lands, a critically damped follower for the live target, and the rules for when the R key may summon.
 */

// ---- the flight profile --------------------------------------------------------------------------------------

/**
 * The profile is the CSS curve `cubic-bezier(0.7, 0, 0.2, 1)`, solved exactly. Why this one:
 * - the first control point (0.7, 0) keeps the slope near zero for a long while, so the orb is slow to get going,
 *   like inertia being overcome (about 7% of the way after a quarter of the time);
 * - the middle is steep, so the approach is fast (about 80% of the distance between 30% and 70% of the time);
 * - the second control point (0.2, 1) puts a flat tangent at the end, so it settles without overshooting or
 *   wobbling, and a spring-like overshoot is impossible by construction (the curve never exceeds 1);
 * - it is a pure function of elapsed time: easy to test, and the same on every machine and frame rate.
 * An expo in-out was the alternative; its start is so flat (1.5% at a quarter) that the orb seems stuck, then
 * lurches. A real spring cannot start slow, by definition.
 */
const X1 = 0.7
const Y1 = 0
const X2 = 0.2
const Y2 = 1

const bezier = (a: number, b: number, t: number) => {
  const s = 1 - t
  return 3 * s * s * t * a + 3 * s * t * t * b + t * t * t
}

/** Flight progress 0..1 for the elapsed share `u` of the flight's duration: monotonic, exactly 1 at the end. */
export function summonEase(u: number): number {
  if (!(u > 0)) return 0
  if (u >= 1) return 1
  // x(t) is monotonic for control x in [0, 1], so a bisection finds the t for this time exactly enough.
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (bezier(X1, X2, mid) < u) lo = mid
    else hi = mid
  }
  return Math.min(Math.max(bezier(Y1, Y2, (lo + hi) / 2), 0), 1)
}

/** Seconds. A short hop and a long one differ by a third, not by a multiple: the feel stays the same. */
export const SUMMON_MIN_S = 0.9
export const SUMMON_MAX_S = 1.2
/** The distance (CSS px) at which the flight takes the longest. */
const SUMMON_FAR_PX = 1400

export function summonDuration(distance: number): number {
  if (!(distance > 0)) return SUMMON_MIN_S
  return SUMMON_MIN_S + (SUMMON_MAX_S - SUMMON_MIN_S) * Math.min(distance / SUMMON_FAR_PX, 1)
}

// ---- the live target -----------------------------------------------------------------------------------------

export interface Follow {
  x: number
  v: number
}

/**
 * One axis of a critically damped follower, in closed form: the exact answer for any `dt` (a hidden tab's huge
 * step cannot blow it up). Position and velocity are both continuous when the target jumps, so a cursor that
 * moves mid-flight bends the path smoothly instead of kicking it. `omega` is the stiffness in rad/s.
 */
export function stepFollow(state: Follow, target: number, omega: number, dt: number): Follow {
  if (!(dt > 0)) return state
  const a = state.x - target
  const b = state.v + omega * a
  const e = Math.exp(-omega * dt)
  return { x: target + (a + b * dt) * e, v: (b - omega * (a + b * dt)) * e }
}

// ---- where it lands ------------------------------------------------------------------------------------------

/** Air between the orb's glow and the cursor, on top of the glow's radius. */
export const LANDING_GAP = 16

export interface LandingSpec {
  pointer: Point
  width: number
  height: number
  keepOut: readonly Rect[]
  /** The glow's radius. */
  radius: number
  /** Least distance from the orb's center to a keep-out box. */
  clearance: number
  /** Least distance from the orb's center to the viewport edge. */
  margin: number
}

const clampTo = (p: Point, width: number, height: number, margin: number): Point => ({
  x: Math.min(Math.max(p.x, margin), Math.max(width - margin, margin)),
  y: Math.min(Math.max(p.y, margin), Math.max(height - margin, margin)),
})

/** Moves `p` out of `clearance` of a box, along the way from its nearest point (or the nearest edge if inside). */
function pushOut(p: Point, box: Rect, clearance: number): Point {
  const d = distanceToRect(p, box)
  if (d >= clearance) return p
  if (d > 0) {
    const q = { x: Math.min(Math.max(p.x, box.left), box.right), y: Math.min(Math.max(p.y, box.top), box.bottom) }
    return { x: q.x + ((p.x - q.x) / d) * clearance, y: q.y + ((p.y - q.y) / d) * clearance }
  }
  const exits = [
    { x: box.left - clearance, y: p.y, cost: p.x - box.left },
    { x: box.right + clearance, y: p.y, cost: box.right - p.x },
    { x: p.x, y: box.top - clearance, cost: p.y - box.top },
    { x: p.x, y: box.bottom + clearance, cost: box.bottom - p.y },
  ]
  const best = exits.reduce((a, b) => (b.cost < a.cost ? b : a))
  return { x: best.x, y: best.y }
}

/**
 * Where the orb comes to rest for a cursor: NEXT to it, never under it, so the cursor is free to move onto the
 * orb (which then peeks). One glow radius plus a gap away, on the side that faces the middle of the screen
 * (where there is the most room), then kept inside the viewport and clear of the keep-out boxes.
 */
export function summonLanding({ pointer, width, height, keepOut, radius, clearance, margin }: LandingSpec): Point {
  const gap = radius + LANDING_GAP
  const dx = width / 2 - pointer.x
  const dy = height / 2 - pointer.y
  const len = Math.hypot(dx, dy)
  const dir = len < 1 ? { x: 1, y: 0 } : { x: dx / len, y: dy / len }
  let p = clampTo({ x: pointer.x + dir.x * gap, y: pointer.y + dir.y * gap }, width, height, margin)
  // A push can nudge it into another box or past an edge; a few passes settle that, ending on the safe side.
  for (let i = 0; i < 4; i++) {
    for (const box of keepOut) p = pushOut(p, box, clearance)
    p = clampTo(p, width, height, margin)
  }
  return p
}

// ---- the key -------------------------------------------------------------------------------------------------

/** R or r, alone, and not a key held down. */
export function isSummonKeyEvent(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "repeat"> & { isComposing?: boolean }): boolean {
  return (e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && !e.isComposing
}

const EDITABLE = "input, textarea, select, [contenteditable]:not([contenteditable='false'])"
// Anything that takes over the screen: a dialog (Radix sets role and aria-modal), or the intro layer replaying
// over the sky, which marks itself with `data-blocks-shortcuts`.
const MODAL = "[role='dialog'], [role='alertdialog'], [aria-modal='true'], dialog[open], [data-blocks-shortcuts]"

/** True while the key must be left alone: the visitor is typing, or something modal is open. */
export function summonBlocked(doc: Document): boolean {
  const active = doc.activeElement
  if (active && active !== doc.body && active.matches(EDITABLE)) return true
  return doc.querySelector(MODAL) !== null
}
