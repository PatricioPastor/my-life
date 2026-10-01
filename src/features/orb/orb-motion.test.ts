import { describe, expect, it } from "vitest"
import { createOrbMotion, orbMetrics, stepRate } from "./orb-motion"
import type { Rect } from "./orb-path"

const DT = 1 / 60
const keepOut: Rect[] = [
  { left: 0, top: 0, right: 240, bottom: 96 },
  { left: 300, top: 300, right: 500, bottom: 460 },
]
const make = (reduced = false) => {
  const motion = createOrbMotion({ seed: 42, reduced })
  motion.setViewport(1440, 900, keepOut)
  return motion
}
const FREE = { held: false, active: true }
const HELD = { held: true, active: true }
const HIDDEN = { held: false, active: false }

describe("stepRate", () => {
  it("eases down to a stop while captured, never below zero", () => {
    let rate = 1
    let prev = rate
    for (let i = 0; i < 60 * 3; i++) {
      rate = stepRate(rate, true, DT)
      expect(rate).toBeLessThanOrEqual(prev)
      expect(rate).toBeGreaterThanOrEqual(0)
      prev = rate
    }
    expect(rate).toBeLessThan(0.01)
  })

  it("is already slowing in the first moments, but not an instant stop", () => {
    const after = stepRate(1, true, DT)
    expect(after).toBeLessThan(1)
    expect(after).toBeGreaterThan(0.9)
  })

  it("resumes smoothly once released, never above full speed", () => {
    let rate = 0
    let prev = rate
    for (let i = 0; i < 60 * 4; i++) {
      rate = stepRate(rate, false, DT)
      expect(rate).toBeGreaterThanOrEqual(prev)
      expect(rate).toBeLessThanOrEqual(1)
      expect(rate - prev).toBeLessThan(0.05)
      prev = rate
    }
    expect(rate).toBeGreaterThan(0.99)
  })
})

describe("createOrbMotion", () => {
  it("is deterministic for a seed", () => {
    const a = make()
    const b = make()
    for (let i = 0; i < 600; i++) expect(a.step(DT, FREE)).toEqual(b.step(DT, FREE))
  })

  it("eases to a stop when captured and resumes without a jump", () => {
    const m = make()
    for (let i = 0; i < 600; i++) m.step(DT, FREE)
    let prev = m.step(DT, FREE)
    const steps: number[] = []
    for (let i = 0; i < 60 * 4; i++) {
      const f = m.step(DT, HELD)
      steps.push(Math.hypot(f.x - prev.x, f.y - prev.y))
      prev = f
    }
    expect(steps[0]).toBeGreaterThan(0)
    // Monotone slowdown, and at rest by the end.
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThanOrEqual(steps[i - 1] + 1e-9)
    expect(steps.at(-1)!).toBeLessThan(0.01)
    // Releasing: the first frames barely move, then it speeds up with no lurch.
    const resumed: number[] = []
    for (let i = 0; i < 60 * 3; i++) {
      const f = m.step(DT, FREE)
      resumed.push(Math.hypot(f.x - prev.x, f.y - prev.y))
      prev = f
    }
    expect(resumed[0]).toBeLessThan(0.05)
    for (let i = 1; i < resumed.length; i++) expect(Math.abs(resumed[i] - resumed[i - 1])).toBeLessThan(0.06)
    expect(Math.max(...resumed)).toBeGreaterThan(0.1)
  })

  it("fades in with the sky and out when it is no longer shown", () => {
    const m = make()
    expect(m.step(DT, HIDDEN).energy).toBe(0)
    let e = 0
    for (let i = 0; i < 60 * 3; i++) e = m.step(DT, FREE).energy
    expect(e).toBeGreaterThan(0.9)
    for (let i = 0; i < 60 * 3; i++) e = m.step(DT, HIDDEN).energy
    expect(e).toBeLessThan(0.02)
  })

  it("lifts a little when held, as an affordance", () => {
    const m = make()
    let free = m.step(DT, FREE)
    for (let i = 0; i < 300; i++) free = m.step(DT, FREE)
    let held = free
    for (let i = 0; i < 300; i++) held = m.step(DT, HELD)
    expect(held.radius).toBeGreaterThan(free.radius)
  })

  it("under reduced motion drifts near-static and shifts color slowly", () => {
    const normal = make(false)
    const calm = make(true)
    const a0 = normal.step(DT, FREE)
    const b0 = calm.step(DT, FREE)
    let a = a0
    let b = b0
    let hueNormal = 0
    let hueCalm = 0
    for (let i = 0; i < 60 * 20; i++) {
      const na = normal.step(DT, FREE)
      const nb = calm.step(DT, FREE)
      hueNormal += Math.abs(na.hue - a.hue)
      hueCalm += Math.abs(nb.hue - b.hue)
      a = na
      b = nb
    }
    const dNormal = Math.hypot(a.x - a0.x, a.y - a0.y)
    const dCalm = Math.hypot(b.x - b0.x, b.y - b0.y)
    expect(dCalm).toBeGreaterThan(0)
    expect(dCalm).toBeLessThan(dNormal * 0.25)
    expect(hueCalm).toBeLessThan(hueNormal * 0.5)
  })

  it("keeps its frame inside the viewport and its colour in gamut", () => {
    const m = make()
    for (let i = 0; i < 60 * 120; i++) {
      const f = m.step(DT, FREE)
      expect(f.x).toBeGreaterThan(0)
      expect(f.x).toBeLessThan(1440)
      expect(f.y).toBeGreaterThan(0)
      expect(f.y).toBeLessThan(900)
      f.rgb.forEach((v) => expect(v >= 0 && v <= 1).toBe(true))
    }
  })

  it("ignores a stalled frame instead of jumping", () => {
    const m = make()
    const before = m.step(DT, FREE)
    const after = m.step(5, FREE)
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(10)
  })
})

describe("orbMetrics", () => {
  it("gives a phone a smaller orb with a smaller berth, and a desktop a larger one", () => {
    const phone = orbMetrics(390, 844)
    const desktop = orbMetrics(1440, 900)
    expect(phone.radius).toBeLessThan(desktop.radius)
    expect(phone.clearance).toBeLessThan(desktop.clearance)
    expect(phone.margin).toBeGreaterThan(phone.clearance)
  })

  it("keeps the glow's reach inside the clearance", () => {
    for (const [w, h] of [[390, 844], [768, 1024], [1440, 900], [2560, 1440]]) {
      const m = orbMetrics(w, h)
      expect(m.clearance).toBeGreaterThanOrEqual(m.radius * 1.2)
    }
  })
})
