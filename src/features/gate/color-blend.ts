import { mixHex } from "./tunnel-math"

/** Smoothstep over 0..1, clamped. */
export function smooth(t: number): number {
  const x = Math.min(Math.max(t, 0), 1)
  return x * x * (3 - 2 * x)
}

/**
 * The quantized blend step for a ring phase 0..1, in 0..steps.
 * Step 0 is the ring's own color and the last step is the next ring's, so the end of one ring
 * is exactly the start of the next and nothing jumps at the boundary.
 */
export function blendStep(ph: number, steps: number): number {
  if (!(ph > 0)) return 0
  return Math.round(smooth(ph) * steps)
}

export interface BlendCache {
  /** Number of distinct keys; sizes the per-frame draw lists. */
  count: number
  /** Key of the color at ring palette position `a` blending toward `b`, at `step`, for the bright (0) or dim (1) level. */
  key: (a: number, b: number, step: number, level: 0 | 1) => number
  colorOf: (key: number) => string
}

/** Every blended color the tunnel can draw, computed once, so a frame only looks colors up and batches by fillStyle. */
export function createBlendCache(palette: readonly string[], bg: string, steps: number, dimShare: number): BlendCache {
  const k = palette.length
  const stride = steps + 1
  const key = (a: number, b: number, step: number, level: 0 | 1) => ((a * k + b) * stride + step) * 2 + level
  const colors: string[] = new Array(k * k * stride * 2)
  for (let a = 0; a < k; a++)
    for (let b = 0; b < k; b++)
      for (let s = 0; s < stride; s++) {
        const bright = mixHex(palette[b], palette[a], s / steps)
        colors[key(a, b, s, 0)] = bright
        colors[key(a, b, s, 1)] = mixHex(bright, bg, dimShare)
      }
  return { count: colors.length, key, colorOf: (i) => colors[i] }
}
