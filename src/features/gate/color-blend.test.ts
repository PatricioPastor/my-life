import { describe, expect, it } from "vitest"
import { mixHex } from "./tunnel-math"
import { blendStep, createBlendCache, smooth } from "./color-blend"

const RINGS = ["#FFC15E", "#F7B05B", "#F7934C", "#CC5803"]
const BG = "#0A0600"
const STEPS = 6

describe("smooth", () => {
  it("eases 0..1 and clamps outside it", () => {
    expect(smooth(0)).toBe(0)
    expect(smooth(1)).toBe(1)
    expect(smooth(0.5)).toBeCloseTo(0.5, 10)
    expect(smooth(-3)).toBe(0)
    expect(smooth(9)).toBe(1)
    expect(smooth(0.1)).toBeLessThan(0.1)
  })
})

describe("blendStep", () => {
  it("runs from 0 to the last step and never leaves that range", () => {
    expect(blendStep(0, STEPS)).toBe(0)
    expect(blendStep(1, STEPS)).toBe(STEPS)
    let prev = 0
    for (let ph = 0; ph <= 1; ph += 0.001) {
      const s = blendStep(ph, STEPS)
      expect(s).toBeGreaterThanOrEqual(prev)
      expect(s).toBeLessThanOrEqual(STEPS)
      expect(Number.isInteger(s)).toBe(true)
      prev = s
    }
  })

  it("treats a bad phase as the start", () => {
    expect(blendStep(Number.NaN, STEPS)).toBe(0)
  })
})

describe("createBlendCache", () => {
  const cache = createBlendCache(RINGS, BG, STEPS, 0.35)

  it("gives every (pair, step, level) its own key inside the group count", () => {
    const keys = new Set<number>()
    for (let a = 0; a < RINGS.length; a++)
      for (let b = 0; b < RINGS.length; b++)
        for (let s = 0; s <= STEPS; s++)
          for (const level of [0, 1] as const) {
            const key = cache.key(a, b, s, level)
            expect(key).toBeGreaterThanOrEqual(0)
            expect(key).toBeLessThan(cache.count)
            keys.add(key)
          }
    expect(keys.size).toBe(RINGS.length * RINGS.length * (STEPS + 1) * 2)
  })

  it("starts on the ring's own color and ends on the next ring's", () => {
    expect(cache.colorOf(cache.key(0, 2, 0, 0))).toBe(RINGS[0])
    expect(cache.colorOf(cache.key(0, 2, STEPS, 0))).toBe(RINGS[2])
  })

  it("is continuous at a ring boundary: the end of ring n is the start of ring n+1", () => {
    // Ring n blends a -> b, ring n+1 blends b -> c.
    expect(cache.colorOf(cache.key(1, 3, STEPS, 0))).toBe(cache.colorOf(cache.key(3, 0, 0, 0)))
    expect(cache.colorOf(cache.key(1, 3, STEPS, 1))).toBe(cache.colorOf(cache.key(3, 0, 0, 1)))
  })

  it("blends in between, and dims to a share over the background", () => {
    expect(cache.colorOf(cache.key(0, 3, 3, 0))).toBe(mixHex(RINGS[3], RINGS[0], 0.5))
    expect(cache.colorOf(cache.key(0, 3, 0, 1))).toBe(mixHex(RINGS[0], BG, 0.35))
  })
})
