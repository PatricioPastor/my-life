import { describe, expect, it } from "vitest"
import { DUST_LAYERS, dustCount, dustPositionAt, dustReach, makeDust, spriteCoreStop } from "./dust-field"

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
    expect(phone).toBeLessThanOrEqual(26)
    expect(dustCount(0, 0)).toBeGreaterThan(0)
  })

  it("is sparse: about 40% of the earlier field, so the orbs stay in view", () => {
    // The earlier rule drew round(area / 9000), clamped to 90..150 on desktop and to 60 on a phone.
    const before = (w: number, h: number) => {
      const base = Math.round((Math.max(w, 320) * Math.max(h, 480)) / 9000)
      return w < 640 ? Math.min(base, 60) : Math.min(Math.max(base, 90), 150)
    }
    for (const [w, h] of [
      [1440, 900],
      [1920, 1080],
      [1280, 720],
      [390, 844],
      [360, 740],
    ]) {
      expect(dustCount(w, h)).toBeLessThanOrEqual(Math.ceil(before(w, h) * 0.4))
      expect(dustCount(w, h)).toBeGreaterThanOrEqual(Math.floor(before(w, h) * 0.25))
    }
    expect(dustCount(1440, 900)).toBeLessThanOrEqual(60)
    expect(dustCount(3840, 2160)).toBeLessThanOrEqual(60)
  })
})

describe("crisp dust", () => {
  it("keeps every layer small and sharp, with no big blurred bokeh", () => {
    for (const layer of DUST_LAYERS) {
      expect(layer.radius[1]).toBeLessThanOrEqual(2.2)
      expect(layer.softness).toBeLessThanOrEqual(0.4)
      expect(layer.alpha[1]).toBeLessThanOrEqual(0.6)
    }
  })

  it("draws a mote barely wider than itself, wider only as it gets softer", () => {
    const [p] = makeDust(4, 1)
    expect(dustReach({ ...p, radius: 2, softness: 0 })).toBeLessThanOrEqual(2 * 1.3)
    expect(dustReach({ ...p, radius: 2, softness: 0.4 })).toBeGreaterThan(dustReach({ ...p, radius: 2, softness: 0 }))
    for (const mote of makeDust(6, 200)) expect(dustReach(mote)).toBeLessThanOrEqual(mote.radius * 1.8)
  })

  it("keeps the sprite's solid core wide: a sharp falloff, softer only a little", () => {
    expect(spriteCoreStop(0)).toBeGreaterThanOrEqual(0.85)
    expect(spriteCoreStop(0.4)).toBeLessThan(spriteCoreStop(0))
    for (const layer of DUST_LAYERS) expect(spriteCoreStop(layer.softness)).toBeGreaterThanOrEqual(0.6)
  })
})
