import { describe, expect, it } from "vitest"
import { PERIOD, createRingColorSequence } from "./ring-colors"

const PALETTE4 = ["#FFC15E", "#F7B05B", "#F7934C", "#CC5803"] as const
const PALETTE3 = ["#FBFEF9", "#8377D1", "#F3B61F"] as const

const take = (seed: number, count: number, palette: readonly string[] = PALETTE4) => {
  const seq = createRingColorSequence(seed, palette)
  return Array.from({ length: count }, (_, n) => seq.colorAt(n))
}

describe("createRingColorSequence", () => {
  it("is deterministic: the same seed yields the same sequence", () => {
    expect(take(42, PERIOD * 2)).toEqual(take(42, PERIOD * 2))
  })

  it("differs across seeds for at least some rings", () => {
    const a = take(1, 200)
    const b = take(2, 200)
    expect(a.some((c, n) => c !== b[n])).toBe(true)
  })

  it("is cyclic with a fixed period", () => {
    const seq = createRingColorSequence(8, PALETTE4)
    for (let n = 0; n < 300; n++) {
      expect(seq.colorAt(n + PERIOD)).toBe(seq.colorAt(n))
      expect(seq.indexAt(n + 7 * PERIOD)).toBe(seq.indexAt(n))
    }
  })

  it("never repeats the previous ring's color, including across the wrap", () => {
    for (const seed of [0, 1, 99, 123456789, -5]) {
      for (const palette of [PALETTE4, PALETTE3]) {
        const seq = createRingColorSequence(seed, palette)
        for (let n = 1; n <= PERIOD * 3; n++) expect(seq.colorAt(n)).not.toBe(seq.colorAt(n - 1))
        // The last ring of a cycle differs from the first of the next.
        expect(seq.colorAt(PERIOD - 1)).not.toBe(seq.colorAt(PERIOD))
      }
    }
  })

  it("only ever yields palette members, and eventually all of them", () => {
    const seen = new Set(take(5, PERIOD))
    expect([...seen].sort()).toEqual([...PALETTE4].sort())
  })

  it("steps by 1..k-1 palette positions between neighbours", () => {
    const seq = createRingColorSequence(11, PALETTE4)
    for (let n = 1; n <= PERIOD; n++) {
      const gap = (seq.indexAt(n) - seq.indexAt(n - 1) + PALETTE4.length) % PALETTE4.length
      expect(gap).toBeGreaterThanOrEqual(1)
      expect(gap).toBeLessThanOrEqual(PALETTE4.length - 1)
    }
  })

  it("works for a two-color palette by strictly alternating", () => {
    const seq = createRingColorSequence(3, ["#000000", "#ffffff"])
    for (let n = 1; n < PERIOD * 2 + 5; n++) expect(seq.colorAt(n)).not.toBe(seq.colorAt(n - 1))
  })

  it("never throws for huge, negative, fractional or non-finite rings", () => {
    const seq = createRingColorSequence(4, PALETTE4)
    for (const n of [1e15, 1e300, -1e15, -1, -PERIOD, Number.MAX_SAFE_INTEGER, 7.9]) {
      expect(() => seq.colorAt(n)).not.toThrow()
      expect(PALETTE4).toContain(seq.colorAt(n))
    }
    expect(seq.colorAt(Number.NaN)).toBe(seq.colorAt(0))
    expect(seq.colorAt(Number.POSITIVE_INFINITY)).toBe(seq.colorAt(0))
    expect(seq.colorAt(Number.NEGATIVE_INFINITY)).toBe(seq.colorAt(0))
  })

  it("reads negative rings through the cycle", () => {
    const seq = createRingColorSequence(4, PALETTE4)
    expect(seq.colorAt(-1)).toBe(seq.colorAt(PERIOD - 1))
    expect(seq.colorAt(7.9)).toBe(seq.colorAt(7))
  })

  it("rejects a palette that cannot avoid repeats", () => {
    expect(() => createRingColorSequence(1, ["#fff"])).toThrow(RangeError)
    expect(() => createRingColorSequence(1, [])).toThrow(RangeError)
  })
})
