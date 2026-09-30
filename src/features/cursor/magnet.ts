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
    // A held capture wins over a neighbour that is merely closer in the normalized sense.
    const score = held ? -1 : distance / pull
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

/** Reduced motion keeps the reticle responsive but drops the overshoot. */
export function springProfile(reduced: boolean): { omega: number; zeta: number } {
  return reduced ? { omega: 30, zeta: 1 } : { omega: 24, zeta: 0.78 }
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
