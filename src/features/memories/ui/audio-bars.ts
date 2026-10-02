/**
 * The math behind the frequency bars of the player: from the spectrum an AnalyserNode gives (`getByteFrequencyData`)
 * to a handful of smooth, symmetric 0..1 heights. Everything here is pure, so it is tested without any audio.
 */

import { smoothLevel } from "./audio-level"

/** How many bars the player draws (an even count, so the shape has no single middle bar). */
export const BAR_COUNT = 28
/** The height of a bar at rest, as a fraction of its full height: a calm, low baseline. */
export const BAR_REST = 0.14

/** The lowest bin drawn (bin 0 is the DC offset) and the highest, as a fraction of the spectrum (about 6 kHz at 48 kHz). */
const LOW_BIN = 1
const HIGH_FRACTION = 0.25
/** The upper bars sit where a voice has little energy: they are lifted by up to this much so the whole shape moves. */
const TREBLE_LIFT = 0.9
/** A bar this close to rest (in level) is snapped to it, so the loop can stop. */
const SETTLED = 0.004

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const bin = (value: number) => (Number.isFinite(value) ? clamp01(value / 255) : 0)

/**
 * Fills `out` with one 0..1 target per bar. The bars are mirrored around the middle (the low frequencies in the center,
 * the high ones toward the edges), and each one reads a band of the spectrum, the bands growing wider toward the treble
 * the way hearing does. An empty or silent spectrum gives zeros.
 */
export function barTargets(spectrum: ArrayLike<number>, count: number, out: { [index: number]: number }): void {
  const bins = spectrum.length
  const high = Math.max(Math.floor(bins * HIGH_FRACTION), LOW_BIN + 1)
  const middle = (count - 1) / 2
  const ranks = Math.floor(middle) + 1
  for (let i = 0; i < count; i++) {
    const rank = Math.floor(Math.abs(i - middle))
    const from = Math.max(Math.floor(LOW_BIN * (high / LOW_BIN) ** (rank / ranks)), LOW_BIN)
    const to = Math.max(Math.ceil(LOW_BIN * (high / LOW_BIN) ** ((rank + 1) / ranks)), from + 1)
    let sum = 0
    let seen = 0
    for (let b = from; b < to && b < bins; b++) {
      sum += bin(spectrum[b])
      seen++
    }
    const lift = 1 + (TREBLE_LIFT * rank) / Math.max(ranks - 1, 1)
    out[i] = seen === 0 ? 0 : clamp01((sum / seen) * lift)
  }
}

/**
 * One step of every bar toward its target over `dtMs`, quick to rise and slow to fall (the same follower as the voice
 * level). Heights are changed in place. Answers whether any bar is still off rest, so a loop can stop once they settle.
 */
export function stepBars(heights: number[], targets: ArrayLike<number>, dtMs: number): boolean {
  let moving = false
  for (let i = 0; i < heights.length; i++) {
    let next = smoothLevel(heights[i], targets[i] ?? 0, dtMs)
    if (next < SETTLED && (targets[i] ?? 0) < SETTLED) next = 0
    heights[i] = next
    if (next > 0) moving = true
  }
  return moving
}

/** The `scaleY` of a bar for a 0..1 height: the calm baseline at 0, the whole bar at 1. */
export function barScale(height: number): number {
  const h = Number.isFinite(height) ? clamp01(height) : 0
  return BAR_REST + h * (1 - BAR_REST)
}
