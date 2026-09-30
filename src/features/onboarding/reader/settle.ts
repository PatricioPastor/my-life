export interface SettleState {
  x: number
  v: number
}

export interface SettleProfile {
  /** Natural frequency, rad/s: how fast it settles. */
  omega: number
  /** Damping ratio: 1 is critically damped (no overshoot), below 1 bounces a little. */
  zeta: number
}

/**
 * The "snap and settle" of the stack. Slightly underdamped (zeta 0.8) so it overshoots by about 1.5% and comes back,
 * like text that lands and settles. Reduced motion is critically damped and quicker: it arrives and stops.
 */
export function settleProfile(reduced: boolean): SettleProfile {
  return reduced ? { omega: 22, zeta: 1 } : { omega: 11, zeta: 0.8 }
}

/**
 * Exact damped-spring step toward `target` (the closed form), so the result is the same for any frame rate:
 * one 100 ms step and ten 10 ms steps land on the same state.
 */
export function stepSettle(s: SettleState, target: number, dt: number, { omega, zeta }: SettleProfile): SettleState {
  if (dt <= 0) return s
  const d = s.x - target
  if (d === 0 && s.v === 0) return s
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
  return { x: target + e * (d * c + b * sn), v: e * (s.v * c - (d * wd + zeta * omega * b) * sn) }
}

/** Close enough, and slow enough, to stop the animation loop and snap to the target. */
export function isSettled(s: SettleState, target: number): boolean {
  return Math.abs(s.x - target) < 0.001 && Math.abs(s.v) < 0.005
}
