// Pure timing for the focused star: how far the nebula dims, and the entropic reveal's scalars.
// The shader adds the orbiting particles from the same clock (`uFocusTime`); everything is deterministic.

export const FOCUS_IN_S = 0.4
export const FOCUS_OUT_S = 0.4
/** The wild phase fades into a calm idle between these two moments (about 1.2 s to settle). */
export const SETTLE_START = 0.9
export const SETTLE_END = 1.4

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Linear ramp of the focus amount toward `want` (0 or 1); time-based, so frame-rate independent. */
export function stepFocusAmount(amount: number, want: number, dt: number): number {
  if (dt <= 0) return amount
  const rate = 1 / (want > amount ? FOCUS_IN_S : FOCUS_OUT_S)
  return want > amount ? Math.min(want, amount + rate * dt) : Math.max(want, amount - rate * dt)
}

export const easeFocus = (a: number): number => smoothstep(0, 1, a)

function hash01(seed: number, k: number): number {
  let h = (Math.imul(seed | 0, 374761393) + Math.imul(k | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export interface Segment {
  duration: number
  value: number
}

const segmentAt = (seed: number, k: number, minDur: number, maxDur: number, lo: number, hi: number): Segment => ({
  duration: minDur + (maxDur - minDur) * hash01(seed, k * 2),
  value: lo + (hi - lo) * hash01(seed, k * 2 + 1),
})

export function segmentsFor(seed: number, count: number, minDur: number, maxDur: number, lo: number, hi: number): Segment[] {
  return Array.from({ length: count }, (_, k) => segmentAt(seed, k, minDur, maxDur, lo, hi))
}

const MAX_SEGMENTS = 64
const EDGE_S = 0.035

/** A value that holds for a random short span, then jumps to a new random one, easing over each edge. */
function stepped(t: number, seed: number, minDur: number, maxDur: number, lo: number, hi: number): number {
  let start = 0
  let prev = segmentAt(seed, -1, minDur, maxDur, lo, hi).value
  for (let k = 0; k < MAX_SEGMENTS; k++) {
    const seg = segmentAt(seed, k, minDur, maxDur, lo, hi)
    if (t < start + seg.duration) {
      const edge = Math.min(EDGE_S, seg.duration * 0.5)
      return prev + (seg.value - prev) * smoothstep(0, edge, t - start)
    }
    start += seg.duration
    prev = seg.value
  }
  return prev
}

/** Blend from the wild value to the calm one as the reveal settles. */
function settle(t: number, wild: () => number, calm: number): number {
  const w = smoothstep(SETTLE_START, SETTLE_END, t)
  return w >= 1 ? calm : wild() * (1 - w) + calm * w
}

/** Star brightness multiplier: irregular flicker at first, a subtle shimmer near full brightness after. */
export function flickerAt(t: number, seed: number): number {
  const time = Math.max(t, 0)
  const calm = 0.97 + 0.03 * (0.5 * Math.sin(time * 3.1 + seed) + 0.5 * Math.sin(time * 5.3 + seed * 1.7))
  return settle(time, () => stepped(time, seed, 0.05, 0.22, 0.28, 1), calm)
}

/** Core size multiplier: 1 -> about 1.4 over 0.6 s, then a slow, faint pulse. */
export function swellAt(t: number): number {
  const time = Math.max(t, 0)
  if (time < 0.6) {
    const e = 1 - Math.pow(1 - time / 0.6, 3)
    return 1 + 0.4 * e
  }
  return 1.4 + 0.03 * (0.6 * Math.sin(time * 2.3) + 0.4 * Math.sin(time * 4.1 + 1))
}

/** Length multipliers for the four spikes (right, left, up, down): jittery at first, then nearly even. */
export function armsAt(t: number, seed: number): [number, number, number, number] {
  const time = Math.max(t, 0)
  const arm = (j: number) => {
    const s = seed * 7 + j * 13
    const calm = 1.15 + 0.06 * Math.sin(time * (2.1 + 0.7 * j) + j * 1.9)
    return settle(time, () => stepped(time, s, 0.06, 0.3, 0.55, 1.65), calm)
  }
  return [arm(0), arm(1), arm(2), arm(3)]
}

export interface FocusFx {
  flicker: number
  swell: number
  arms: [number, number, number, number]
}

export function focusFx(t: number, seed: number): FocusFx {
  return { flicker: flickerAt(t, seed + 1), swell: swellAt(t), arms: armsAt(t, seed + 2) }
}
