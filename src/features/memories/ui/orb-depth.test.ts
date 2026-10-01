import { describe, expect, it } from "vitest"
import { orbDepth, orbMetrics } from "./orb-depth"

const ids = Array.from({ length: 200 }, (_, i) => `memory-${i}`)

describe("orbDepth", () => {
  it("is deterministic per id and spans the range", () => {
    expect(orbDepth("a")).toBe(orbDepth("a"))
    const zs = ids.map(orbDepth)
    for (const z of zs) {
      expect(z).toBeGreaterThanOrEqual(0)
      expect(z).toBeLessThanOrEqual(1)
    }
    expect(Math.min(...zs)).toBeLessThan(0.2)
    expect(Math.max(...zs)).toBeGreaterThan(0.8)
  })
})

describe("orbMetrics", () => {
  it("makes nearer orbs bigger, brighter and crisper, and far ones small, dim and soft", () => {
    const far = orbMetrics(0)
    const near = orbMetrics(1)
    expect(near.size).toBeGreaterThan(far.size)
    expect(near.alpha).toBeGreaterThan(far.alpha)
    expect(near.softness).toBeLessThan(far.softness)
    expect(near.driftScale).toBeGreaterThan(far.driftScale)
  })

  it("is monotonic across the range", () => {
    let last = orbMetrics(0)
    for (let z = 0.1; z <= 1.0001; z += 0.1) {
      const m = orbMetrics(z)
      expect(m.size).toBeGreaterThanOrEqual(last.size)
      expect(m.alpha).toBeGreaterThanOrEqual(last.alpha)
      last = m
    }
  })

  it("keeps the orbs a comfortable size and always visible", () => {
    for (const z of [0, 0.5, 1]) {
      const m = orbMetrics(z)
      expect(m.size).toBeGreaterThanOrEqual(6)
      expect(m.size).toBeLessThanOrEqual(16)
      expect(m.alpha).toBeGreaterThanOrEqual(0.5)
      expect(m.alpha).toBeLessThanOrEqual(1)
    }
  })

  it("clamps depth outside 0..1", () => {
    expect(orbMetrics(-3)).toEqual(orbMetrics(0))
    expect(orbMetrics(9)).toEqual(orbMetrics(1))
  })
})
