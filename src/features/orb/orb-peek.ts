import { distanceToRect, type Rect } from "./orb-path"

/**
 * The orb's "peek": one 0..1 value that is 0 while it floats as a soft glow and 1 once it has grown into a
 * window onto the memories dimension. Everything about the zoom (size, how much of the dimension shows, how
 * far the sky's lamp is held back) is derived from this one number, so it stays interruptible: the value
 * simply continues from wherever it is, toward whichever target it is given next.
 */

/** Seconds. A strong ease-out (an exponential approach): it grabs fast and settles in about 400 ms. */
export const PEEK_IN_TAU = 0.1
export const PEEK_OUT_TAU = 0.14
/** Reduced motion: no zoom, just a short even crossfade to the preview. */
export const PEEK_REDUCED_S = 0.2
/** Below this the last sliver is snapped, so a value always lands exactly on its target. */
const PEEK_SNAP = 0.002

/** How far the lens grows at most, as a multiple of its resting size. */
export const PEEK_MAX_SCALE = 2
/** The lens sphere's radius as a share of the glow radius: a clear disc a little inside the soft halo. */
export const LENS_SHARE = 0.9
/** Air kept between the lens (with its chromatic rim) and a keep-out box or the edge of the screen. */
export const LENS_PAD = 8

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

/** Moves `peek` toward `want` (0 or 1). Pure and stateless, so a reversal never jumps. */
export function stepPeek(peek: number, want: number, dt: number, reduced: boolean): number {
  const from = clamp01(peek)
  if (!(dt > 0)) return from
  const to = clamp01(want)
  if (reduced) {
    const step = dt / PEEK_REDUCED_S
    return to > from ? Math.min(to, from + step) : Math.max(to, from - step)
  }
  const tau = to > from ? PEEK_IN_TAU : PEEK_OUT_TAU
  const next = from + (to - from) * (1 - Math.exp(-dt / tau))
  return Math.abs(to - next) < PEEK_SNAP ? to : clamp01(next)
}

export interface PeekSpace {
  /** Where the orb is, in CSS px from the top-left. */
  x: number
  y: number
  /** The glow radius in CSS px. */
  radius: number
  width: number
  height: number
  /** The boxes the orb floats clear of. */
  keepOut: readonly Rect[]
  reduced?: boolean
}

/**
 * How far the lens may grow from here: as large as `PEEK_MAX_SCALE`, but never so large that it reaches a
 * keep-out box or the edge of the screen, and never smaller than the orb is already. It is a continuous
 * function of position, so the zoom can follow a moving orb without a jump.
 */
export function peekScale({ x, y, radius, width, height, keepOut, reduced = false }: PeekSpace): number {
  if (reduced) return 1
  let room = Math.min(x, y, width - x, height - y)
  for (const box of keepOut) room = Math.min(room, distanceToRect({ x, y }, box))
  const scale = (room - LENS_PAD) / (radius * LENS_SHARE)
  return Math.min(Math.max(scale, 1), PEEK_MAX_SCALE)
}

/** The lens sphere's radius in CSS px for a peek amount, given the scale it may grow to. */
export function lensRadius(radius: number, scale: number, peek: number): number {
  return radius * LENS_SHARE * (1 + (scale - 1) * clamp01(peek))
}
