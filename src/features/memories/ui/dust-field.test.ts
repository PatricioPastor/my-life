import { describe, expect, it } from "vitest"
import { DUST_LAYERS, dustCount, dustPositionAt, makeDust } from "./dust-field"

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

describe("makeDust", () => {
  it("is deterministic for a seed and differs between seeds", () => {
    expect(makeDust(7, 120)).toEqual(makeDust(7, 120))
    expect(makeDust(7, 120)).not.toEqual(makeDust(8, 120))
  })

  it("makes exactly the number asked for", () => {
    expect(makeDust(1, 0)).toEqual([])
    expect(makeDust(1, 90)).toHaveLength(90)
  })

  it("keeps every particle inside the unit square and in a known layer", () => {
    for (const p of makeDust(3, 300)) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThan(1)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThan(1)
      expect(p.layer).toBeGreaterThanOrEqual(0)
      expect(p.layer).toBeLessThan(DUST_LAYERS.length)
    }
  })

  it("fills every depth layer, the far one most", () => {
    const dust = makeDust(5, 300)
    const counts = DUST_LAYERS.map((_, layer) => dust.filter((p) => p.layer === layer).length)
    for (const count of counts) expect(count).toBeGreaterThan(0)
    expect(counts[0]).toBeGreaterThan(counts[counts.length - 1])
  })

  it("makes nearer layers bigger, softer, faster and more responsive to the pointer", () => {
    const dust = makeDust(11, 600)
    const by = (layer: number) => dust.filter((p) => p.layer === layer)
    const stat = (pick: (p: (typeof dust)[number]) => number) => DUST_LAYERS.map((_, l) => mean(by(l).map(pick)))
    for (const series of [
      stat((p) => p.radius),
      stat((p) => p.softness),
      stat((p) => Math.hypot(p.vx, p.vy)),
      stat((p) => p.parallax),
    ]) {
      for (let i = 1; i < series.length; i++) expect(series[i]).toBeGreaterThan(series[i - 1])
    }
  })

  it("keeps every particle tiny, round and faint", () => {
    for (const p of makeDust(2, 300)) {
      expect(p.radius).toBeGreaterThan(0)
      expect(p.radius).toBeLessThanOrEqual(3.5)
      expect(p.alpha).toBeGreaterThan(0)
      expect(p.alpha).toBeLessThanOrEqual(0.6)
    }
  })
})

describe("dustPositionAt", () => {
  const [p] = makeDust(9, 1)

  it("starts where the particle was placed", () => {
    expect(dustPositionAt(p, 0)).toEqual({ x: p.x, y: p.y })
  })

  it("is a pure function of time that wraps inside the unit square", () => {
    for (const t of [0, 1, 37.5, 600, 86_400, 1e6]) {
      const at = dustPositionAt(p, t)
      expect(at).toEqual(dustPositionAt(p, t))
      expect(at.x).toBeGreaterThanOrEqual(0)
      expect(at.x).toBeLessThan(1)
      expect(at.y).toBeGreaterThanOrEqual(0)
      expect(at.y).toBeLessThan(1)
    }
  })

  it("drifts slowly", () => {
    const a = dustPositionAt(p, 0)
    const b = dustPositionAt(p, 1)
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(0.02)
  })
})

describe("dustCount", () => {
  it("scales with the viewport and stays modest on phones", () => {
    const desktop = dustCount(1440, 900)
    const phone = dustCount(390, 844)
    expect(phone).toBeLessThan(desktop)
    expect(phone).toBeLessThanOrEqual(70)
    expect(desktop).toBeLessThanOrEqual(160)
    expect(dustCount(0, 0)).toBeGreaterThan(0)
  })
})
