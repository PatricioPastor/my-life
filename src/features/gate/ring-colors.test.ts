import { describe, expect, it } from "vitest"
import { MAX_RING, createRingColorSequence } from "./ring-colors"

const PALETTE3 = ["#FBFEF9", "#8377D1", "#F3B61F"] as const

const take = (seed: number, count: number, palette: readonly string[] = PALETTE3) => {
  const seq = createRingColorSequence(seed, palette)
  return Array.from({ length: count }, (_, n) => seq.colorAt(n))
}

describe("createRingColorSequence", () => {
  it("is deterministic: the same seed yields the same sequence", () => {
    expect(take(42, 300)).toEqual(take(42, 300))
  })

  it("is independent of the order rings are asked for", () => {
    const forward = createRingColorSequence(7, PALETTE3)
    const jumpy = createRingColorSequence(7, PALETTE3)
    const late = jumpy.colorAt(500)
    expect(late).toBe(forward.colorAt(500))
    for (let n = 0; n <= 500; n++) expect(jumpy.colorAt(n)).toBe(forward.colorAt(n))
  })

  it("differs across seeds for at least some rings", () => {
    const a = take(1, 200)
    const b = take(2, 200)
    expect(a.some((c, n) => c !== b[n])).toBe(true)
  })

  it("never repeats the previous ring's color, up to ring 2000", () => {
    for (const seed of [0, 1, 99, 123456789, -5]) {
      const seq = createRingColorSequence(seed, PALETTE3)
      for (let n = 1; n <= 2000; n++) expect(seq.colorAt(n)).not.toBe(seq.colorAt(n - 1))
    }
  })

  it("only ever yields palette members, and eventually all of them", () => {
    const seen = new Set(take(5, 2000))
    expect([...seen].sort()).toEqual([...PALETTE3].sort())
  })

  it("follows the exact rule c(n) = palette[(idx(c(n-1)) + 1 + step) mod k], step in [0, k-2]", () => {
    const seq = createRingColorSequence(11, PALETTE3)
    for (let n = 1; n <= 500; n++) {
      const gap = (seq.indexAt(n) - seq.indexAt(n - 1) + PALETTE3.length) % PALETTE3.length
      expect(gap).toBeGreaterThanOrEqual(1)
      expect(gap).toBeLessThanOrEqual(PALETTE3.length - 1)
    }
  })

  it("works for a two-color palette by strictly alternating", () => {
    const seq = createRingColorSequence(3, ["#000000", "#ffffff"])
    for (let n = 1; n < 50; n++) expect(seq.colorAt(n)).not.toBe(seq.colorAt(n - 1))
  })

  it("returns the memoized answer for a repeated ring", () => {
    const seq = createRingColorSequence(9, PALETTE3)
    expect(seq.colorAt(80)).toBe(seq.colorAt(80))
    expect(seq.indexAt(80)).toBe(PALETTE3.indexOf(seq.colorAt(80) as (typeof PALETTE3)[number]))
  })

  it("clamps a negative, fractional or non-finite ring to a defined value", () => {
    const seq = createRingColorSequence(4, PALETTE3)
    expect(seq.colorAt(-1)).toBe(seq.colorAt(0))
    expect(seq.colorAt(-1e9)).toBe(seq.colorAt(0))
    expect(seq.colorAt(Number.NaN)).toBe(seq.colorAt(0))
    expect(seq.colorAt(Number.NEGATIVE_INFINITY)).toBe(seq.colorAt(0))
    expect(seq.colorAt(7.9)).toBe(seq.colorAt(7))
  })

  it("throws a RangeError for a ring beyond the cap instead of allocating without bound", () => {
    const seq = createRingColorSequence(4, PALETTE3)
    expect(() => seq.colorAt(MAX_RING + 1)).toThrow(RangeError)
    expect(() => seq.colorAt(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it("rejects a palette that cannot avoid repeats", () => {
    expect(() => createRingColorSequence(1, ["#fff"])).toThrow(RangeError)
    expect(() => createRingColorSequence(1, [])).toThrow(RangeError)
  })
})
