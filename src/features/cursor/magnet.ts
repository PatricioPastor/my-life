export interface Point {
  x: number
  y: number
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export type MagnetStrength = "strong" | "light"

export interface MagnetTarget {
  id: string
  strength: MagnetStrength
  rect: Rect
}

/**
 * Radii are measured from the target's edge, in CSS px. Stars pull from far and capture generously;
 * buttons and rows pull lightly and capture only when the pointer is essentially on them.
 */
export const MAGNET = {
  strong: { pull: 110, capture: 22, pullStrength: 0.7 },
  light: { pull: 44, capture: 4, pullStrength: 0.35 },
  /** A held capture survives this much extra distance, so the edge never flickers. */
  release: 10,
} as const

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

export function distanceToRect(p: Point, r: Rect): number {
  const dx = Math.max(r.left - p.x, 0, p.x - (r.left + r.width))
  const dy = Math.max(r.top - p.y, 0, p.y - (r.top + r.height))
  return Math.hypot(dx, dy)
}

const centerOf = (r: Rect): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })

/** How far the reticle bends toward a target: `pullStrength` at the target, easing to 0 at the pull radius. */
export function bendAmount(distance: number, strength: MagnetStrength): number {
  const { pull, pullStrength } = MAGNET[strength]
  const t = clamp01(distance / pull)
  return pullStrength * (1 - t * t * (3 - 2 * t))
}

export interface MagnetResult {
  target: MagnetTarget | null
  distance: number
  captured: boolean
  /** Where the reticle wants to be: the bent pointer, or the target's center once captured. */
  point: Point
}

/** Pick the target the pointer is being pulled toward, and whether it is captured. */
export function resolveMagnet(pointer: Point, targets: readonly MagnetTarget[], capturedId: string | null): MagnetResult {
  let best: MagnetTarget | null = null
  let bestDistance = Infinity
  let bestScore = Infinity
  for (const t of targets) {
    const distance = distanceToRect(pointer, t.rect)
    const { pull, capture } = MAGNET[t.strength]
    const held = t.id === capturedId && distance <= capture + MAGNET.release
    if (distance > pull && !held) continue
    // What you see is what you click: a target under the pointer wins, then a held capture, then the
    // nearest in the normalized sense.
    const score = (distance === 0 ? -2 : 0) + (held ? -1 : distance / pull)
    if (score < bestScore) {
      best = t
      bestDistance = distance
      bestScore = score
    }
  }
  if (!best) return { target: null, distance: Infinity, captured: false, point: pointer }

  const { capture } = MAGNET[best.strength]
  const captured = bestDistance <= capture || (best.id === capturedId && bestDistance <= capture + MAGNET.release)
  const center = centerOf(best.rect)
  if (captured) return { target: best, distance: bestDistance, captured, point: center }
  const k = bendAmount(bestDistance, best.strength)
  return {
    target: best,
    distance: bestDistance,
    captured,
    point: { x: pointer.x + (center.x - pointer.x) * k, y: pointer.y + (center.y - pointer.y) * k },
  }
}

export interface SpringState {
  x: number
  v: number
}

/**
 * Exact damped-spring step toward `target` (closed form), so it is stable for any dt and gives the
 * same result whether it runs in one big step or many small ones. `omega` is the natural frequency
 * in rad/s; `zeta` < 1 overshoots slightly, 1 is critically damped.
 */
export function stepSpring(s: SpringState, target: number, dt: number, omega: number, zeta: number): SpringState {
  const d = s.x - target
  if (d === 0 && s.v === 0) return s
  if (dt <= 0) return s
  if (zeta >= 1) {
    const e = Math.exp(-omega * dt)
    const b = s.v + omega * d
    return { x: target + (d + b * dt) * e, v: (s.v - b * omega * dt) * e }
  }
  const wd = omega * Math.sqrt(1 - zeta * zeta)
  const e = Math.exp(-zeta * omega * dt)
  const c = Math.cos(wd * dt)
  const sn = Math.sin(wd * dt)
  const b = (s.v + zeta * omega * d) / wd
  return {
    x: target + e * (d * c + b * sn),
    v: e * (s.v * c - (d * wd + zeta * omega * b) * sn),
  }
}

/**
 * The magnetic offset is always critically damped: quick, with no overshoot. Reduced motion is just
 * a little snappier.
 */
export function springProfile(reduced: boolean): { omega: number; zeta: number } {
  return reduced ? { omega: 40, zeta: 1 } : { omega: 28, zeta: 1 }
}

export interface FollowState {
  /** The magnetic offset of the reticle from the real pointer, per axis. */
  ox: SpringState
  oy: SpringState
}

export const REST_FOLLOW: FollowState = { ox: { x: 0, v: 0 }, oy: { x: 0, v: 0 } }

/**
 * The reticle is the real pointer plus a smoothed magnetic offset. Free movement therefore has
 * exactly zero lag: only the pull toward a target (and the release from it) is eased.
 */
export function stepFollow(
  f: FollowState,
  pointer: Point,
  want: Point,
  dt: number,
  omega: number,
): { follow: FollowState; position: Point } {
  const ox = stepSpring(f.ox, want.x - pointer.x, dt, omega, 1)
  const oy = stepSpring(f.oy, want.y - pointer.y, dt, omega, 1)
  return { follow: { ox, oy }, position: { x: pointer.x + ox.x, y: pointer.y + oy.x } }
}

const INTERACTIVE =
  "a[href],button,input,textarea,select,label,summary,[role='button'],[contenteditable]:not([contenteditable='false']),[tabindex]:not([tabindex='-1'])"

/** True when `target`, or an ancestor inside `stage`, is a control the user can act on themselves. */
export function isInteractive(target: Element, stage: Element): boolean {
  for (let n: Element | null = target; n && n !== stage; n = n.parentElement) {
    if (n.matches(INTERACTIVE)) return true
  }
  return false
}

/**
 * The native cursor is hidden, so the user clicks where the reticle is. A pointer click that lands
 * on empty space outside the captured target (inside its capture zone) must still activate it, once.
 * Clicks that already hit the target, clicks on any other control, and keyboard activation (detail 0)
 * are left alone.
 */
export function shouldForwardClick(c: {
  capturedId: string | null
  insideCaptured: boolean
  detail: number
  onInteractive: boolean
}): boolean {
  return c.capturedId !== null && !c.insideCaptured && !c.onInteractive && c.detail > 0
}

const TIP_GAP = 12
const TIP_MARGIN = 8

export interface TooltipPlacement {
  /** Horizontal center of the tooltip. */
  x: number
  /** Top edge of the tooltip. */
  y: number
  below: boolean
}

/** Center the tooltip above the anchor, clamp it to the viewport, and drop it below when the top is tight. */
export function placeTooltip(
  anchor: { cx: number; top: number; bottom: number },
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
): TooltipPlacement {
  const half = tip.width / 2
  const min = half + TIP_MARGIN
  const max = Math.max(viewport.width - half - TIP_MARGIN, min)
  const x = Math.min(Math.max(anchor.cx, min), max)
  const above = anchor.top - TIP_GAP - tip.height
  if (above >= TIP_MARGIN) return { x, y: above, below: false }
  return { x, y: anchor.bottom + TIP_GAP, below: true }
}
