/** Rings per cycle. The lookup wraps here, so it is bounded in memory and total for any input. */
export const PERIOD = 1024

export interface RingColorSequence {
  /** The palette color of ring `n`. n is floored and read through the cycle; a non-finite n reads as ring 0. */
  colorAt: (n: number) => string
  /** The palette position of ring `n`, under the same rule. */
  indexAt: (n: number) => number
}

/** A deterministic 32-bit hash of (seed, n): a murmur-style finalizer, so neighbouring rings decorrelate. */
export function ringRand(seed: number, n: number): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul((n | 0) + 0x7f4a7c15, 0x85ebca6b)) | 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * The portal's ring colors as a recursive rule over a seeded hash, closed into a cycle of PERIOD rings:
 * c(0) = palette[rand(seed, 0) mod k], c(n) = palette[(idx(c(n-1)) + 1 + rand(seed, n) mod (k-1)) mod k].
 * The step is 1..k-1, so a ring never shares its predecessor's color. The last ring of the cycle also avoids
 * the first, so the wrap has no repeat either. The whole cycle is built once; a lookup is one modulo.
 */
export function createRingColorSequence(seed: number, palette: readonly string[]): RingColorSequence {
  const k = palette.length
  if (k < 2) throw new RangeError("A ring palette needs at least two colors to avoid repeats")
  const cycle = new Uint8Array(PERIOD)
  cycle[0] = ringRand(seed, 0) % k
  for (let i = 1; i < PERIOD; i++) {
    cycle[i] = (cycle[i - 1] + 1 + (ringRand(seed, i) % (k - 1))) % k
  }
  if (k >= 3 && cycle[PERIOD - 1] === cycle[0]) {
    // Move the last ring to a color that differs from both neighbours (k >= 3 always leaves one).
    const options: number[] = []
    for (let c = 0; c < k; c++) if (c !== cycle[PERIOD - 2] && c !== cycle[0]) options.push(c)
    cycle[PERIOD - 1] = options[ringRand(seed, PERIOD - 1) % options.length]
  }
  // With k = 2 the sequence strictly alternates, and PERIOD is even, so the wrap already differs.

  const indexAt = (n: number): number => {
    if (!Number.isFinite(n)) return cycle[0]
    return cycle[((Math.floor(n) % PERIOD) + PERIOD) % PERIOD]
  }

  return { colorAt: (n) => palette[indexAt(n)], indexAt }
}
