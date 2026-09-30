import { describe, expect, it } from "vitest"
import { dimTint, mixHex, nextRingIndex, ringDepth } from "./tunnel-math"

describe("mixHex", () => {
  it("returns the background at 0 and the foreground at 1", () => {
    expect(mixHex("#FBFEF9", "#191923", 0)).toBe("#191923")
    expect(mixHex("#FBFEF9", "#191923", 1)).toBe("#FBFEF9")
  })

  it("lays the foreground over the background by its share", () => {
    expect(mixHex("#FFFFFF", "#000000", 0.35)).toBe("#595959")
  })
})

describe("dimTint", () => {
  it("is the ring color at 35% over Shadow Grey", () => {
    // Per channel, rounded: 0.35*F3 + 0.65*19 = 65, 0.35*B6 + 0.65*19 = 50, 0.35*1F + 0.65*23 = 22.
    expect(dimTint("#F3B61F")).toBe("#655022")
    expect(dimTint("#191923")).toBe("#191923")
  })
})

describe("ringDepth", () => {
  it("grows toward the vanishing point and advances with the phase", () => {
    expect(ringDepth(0.1, 0)).toBeGreaterThan(ringDepth(0.5, 0))
    expect(ringDepth(0.5, 2)).toBeCloseTo(ringDepth(0.5, 0) + 2, 10)
  })
})

describe("nextRingIndex", () => {
  it("is the ring just past the innermost radius at the current phase", () => {
    expect(nextRingIndex(0, 0.5)).toBe(1)
    expect(nextRingIndex(0.5, 0.5)).toBe(2)
  })

  it("only ever steps up by one as the phase advances", () => {
    let prev = nextRingIndex(0)
    for (let phase = 0.01; phase < 20; phase += 0.01) {
      const idx = nextRingIndex(phase)
      expect(idx - prev).toBeGreaterThanOrEqual(0)
      expect(idx - prev).toBeLessThanOrEqual(1)
      prev = idx
    }
  })
})
