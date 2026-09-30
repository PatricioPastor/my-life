export interface Shift {
  x: number
  y: number
}

export interface ParallaxState {
  /** The shift currently applied to the label layer. */
  x: number
  y: number
  vx: number
  vy: number
  /** True from a release until the applied shift has caught up with the raw one. */
  easing: boolean
}

export const PARALLAX_REST: ParallaxState = { x: 0, y: 0, vx: 0, vy: 0, easing: false }

/** After a freeze ends, the layer settles onto the live shift in about this long. */
export const PARALLAX_EASE_MS = 250
// A critically damped spring is within 5% of its target after 4.75 / omega seconds.
const OMEGA = 4.75 / (PARALLAX_EASE_MS / 1000)
const SNAP = 0.05

// Exact critically damped step: stable and identical for any dt split.
function step(x: number, v: number, target: number, dt: number): [number, number] {
  const d = x - target
  const e = Math.exp(-OMEGA * dt)
  const b = v + OMEGA * d
  return [target + (d + b * dt) * e, (v - b * OMEGA * dt) * e]
}

/**
 * The label layer follows the sky's parallax, except while a star is captured: then it holds still so
 * the star cannot drift out from under the pointer. The raw shift keeps updating underneath, so on
 * release the layer eases toward it (no snap) and then tracks it exactly again.
 */
export function stepParallax(s: ParallaxState, raw: Shift, frozen: boolean, dt: number): ParallaxState {
  if (frozen) return s.vx === 0 && s.vy === 0 && s.easing ? s : { ...s, vx: 0, vy: 0, easing: true }
  if (!s.easing || dt <= 0) return s.easing ? s : { x: raw.x, y: raw.y, vx: 0, vy: 0, easing: false }
  const [x, vx] = step(s.x, s.vx, raw.x, dt)
  const [y, vy] = step(s.y, s.vy, raw.y, dt)
  const settled = Math.abs(x - raw.x) < SNAP && Math.abs(y - raw.y) < SNAP && Math.abs(vx) + Math.abs(vy) < SNAP
  return settled ? { x: raw.x, y: raw.y, vx: 0, vy: 0, easing: false } : { x, y, vx, vy, easing: true }
}
