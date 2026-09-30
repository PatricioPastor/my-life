/** Rings past this are refused; the memo is one small int per ring, so the cap only guards runaway input. */
export const MAX_RING = 1_000_000

export interface RingColorSequence {
  /** The palette color of ring `n`; n is floored, and anything below 0 or not a number reads as ring 0. */
  colorAt: (n: number) => string
  /** The palette position of ring `n`, under the same clamping. */
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
 * The portal's ring colors as a recursive rule over a seeded hash:
 * c(0) = palette[rand(seed, 0) mod k], c(n) = palette[(idx(c(n-1)) + 1 + rand(seed, n) mod (k-1)) mod k].
 * The step is 1..k-1, so a ring never shares its predecessor's color. The sequence is built once,
 * iteratively, and only ever extended, so asking for ring n costs O(1) after the first visit.
 */
export function createRingColorSequence(seed: number, palette: readonly string[]): RingColorSequence {
  const k = palette.length
  if (k < 2) throw new RangeError("A ring palette needs at least two colors to avoid repeats")
  const indices: number[] = [ringRand(seed, 0) % k]

  const indexAt = (n: number): number => {
    const ring = Number.isNaN(n) ? 0 : Math.max(Math.floor(n), 0)
    if (ring > MAX_RING) throw new RangeError(`Ring ${n} is beyond the cap of ${MAX_RING}`)
    for (let i = indices.length; i <= ring; i++) {
      indices.push((indices[i - 1] + 1 + (ringRand(seed, i) % (k - 1))) % k)
    }
    return indices[ring]
  }

  return { colorAt: (n) => palette[indexAt(n)], indexAt }
}
