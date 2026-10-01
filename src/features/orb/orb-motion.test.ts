import { describe, expect, it } from "vitest"
import { createOrbMotion, orbMetrics, stepRate } from "./orb-motion"
import { LENS_SHARE, PEEK_MAX_SCALE } from "./orb-peek"
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

describe("the peek", () => {
  const settle = (m: ReturnType<typeof make>, input: { held: boolean; active: boolean; parked?: boolean }, frames: number) => {
    let f = m.step(DT, input)
    for (let i = 1; i < frames; i++) f = m.step(DT, input)
    return f
  }

  it("is 0 while it floats, and the lens is just the glow's own size", () => {
    const m = make()
    const f = settle(m, FREE, 120)
    expect(f.peek).toBe(0)
    expect(f.zoom).toBe(1)
    expect(f.lens).toBeCloseTo(f.radius * LENS_SHARE, 6)
  })

  it("rises to 1 within half a second of being held, and the lens grows by the scale", () => {
    const m = make()
    settle(m, FREE, 120)
    const f = settle(m, HELD, 30)
    expect(f.peek).toBeGreaterThan(0.97)
    expect(f.zoom).toBeGreaterThan(1.5)
    expect(f.zoom).toBeLessThanOrEqual(PEEK_MAX_SCALE)
    expect(f.lens).toBeGreaterThan(f.radius * LENS_SHARE * 1.5)
  })

  it("never zooms the glow itself: the lens grows, the radius only keeps its small lift", () => {
    const m = make()
    settle(m, FREE, 120)
    const free = m.step(DT, FREE)
    const held = settle(m, HELD, 120)
    expect(held.radius).toBeLessThan(free.radius * 1.2)
  })

  it("follows the target monotonically, in both directions", () => {
    const m = make()
    settle(m, FREE, 60)
    let prev = 0
    for (let i = 0; i < 60; i++) {
      const f = m.step(DT, HELD)
      expect(f.peek).toBeGreaterThanOrEqual(prev)
      prev = f.peek
    }
    for (let i = 0; i < 60; i++) {
      const f = m.step(DT, FREE)
      expect(f.peek).toBeLessThanOrEqual(prev)
      prev = f.peek
    }
    expect(prev).toBe(0)
  })

  it("is interruptible: holding again mid-release continues from the current value", () => {
    const m = make()
    settle(m, HELD, 60)
    const mid = settle(m, FREE, 8)
    expect(mid.peek).toBeGreaterThan(0.1)
    expect(mid.peek).toBeLessThan(0.95)
    const again = m.step(DT, HELD)
    expect(again.peek).toBeGreaterThan(mid.peek)
    expect(again.peek - mid.peek).toBeLessThan(0.15)
    expect(Math.abs(again.lens - mid.lens)).toBeLessThan(6)
  })

  it("keeps the lens off the keep-out boxes and the screen edge all along the path", () => {
    const m = make()
    for (let i = 0; i < 60 * 90; i++) {
      const f = settle(m, i % 400 < 200 ? HELD : FREE, 1)
      const edge = Math.min(f.x, f.y, 1440 - f.x, 900 - f.y)
      expect(f.lens).toBeLessThanOrEqual(Math.max(edge, f.radius * LENS_SHARE) + 1e-6)
      for (const b of keepOut) {
        const gap = Math.hypot(Math.max(b.left - f.x, 0, f.x - b.right), Math.max(b.top - f.y, 0, f.y - b.bottom))
        expect(f.lens).toBeLessThanOrEqual(Math.max(gap, f.radius * LENS_SHARE) + 1e-6)
      }
    }
  })

  it("under reduced motion crossfades to the preview without growing", () => {
    const m = make(true)
    const rest = settle(m, FREE, 60)
    const f = settle(m, HELD, 30)
    expect(f.peek).toBe(1)
    expect(f.zoom).toBe(1)
    expect(f.lens).toBeCloseTo(rest.lens, 6)
  })

  it("parks the orb on a trip without peeking", () => {
    const m = make()
    settle(m, FREE, 120)
    const before = m.step(DT, FREE)
    const parked = settle(m, { held: false, active: true, parked: true }, 240)
    expect(parked.peek).toBe(0)
    expect(Math.hypot(parked.x - before.x, parked.y - before.y)).toBeLessThan(20)
    expect(parked.rate).toBeLessThan(0.01)
  })
})
