import { describe, expect, it } from "vitest"
import {
  MAGNET,
  bendAmount,
  distanceToRect,
  placeTooltip,
  resolveMagnet,
  springProfile,
  stepSpring,
  type MagnetTarget,
} from "./magnet"

const star = (id: string, cx: number, cy: number): MagnetTarget => ({
  id,
  strength: "strong",
  rect: { left: cx - 24, top: cy - 24, width: 48, height: 48 },
})
const row = (id: string, left: number, top: number): MagnetTarget => ({
  id,
  strength: "light",
  rect: { left, top, width: 400, height: 72 },
})

describe("distanceToRect", () => {
  const r = { left: 100, top: 100, width: 50, height: 20 }
  it("is zero inside and along the edge", () => {
    expect(distanceToRect({ x: 120, y: 110 }, r)).toBe(0)
    expect(distanceToRect({ x: 100, y: 100 }, r)).toBe(0)
  })
  it("measures to the nearest edge or corner", () => {
    expect(distanceToRect({ x: 90, y: 110 }, r)).toBe(10)
    expect(distanceToRect({ x: 153, y: 124 }, r)).toBe(5)
  })
})

describe("bendAmount", () => {
  it("is strongest at the target and eases to zero at the pull radius", () => {
    const { pull, pullStrength } = MAGNET.strong
    expect(bendAmount(0, "strong")).toBeCloseTo(pullStrength)
    expect(bendAmount(pull, "strong")).toBe(0)
    expect(bendAmount(pull * 2, "strong")).toBe(0)
  })
  it("falls off monotonically", () => {
    let last = Infinity
    for (let d = 0; d <= MAGNET.strong.pull; d += 8) {
      const v = bendAmount(d, "strong")
      expect(v).toBeLessThanOrEqual(last)
      last = v
    }
  })
  it("pulls stars harder than light targets", () => {
    expect(bendAmount(10, "strong")).toBeGreaterThan(bendAmount(10, "light"))
    expect(MAGNET.strong.pull).toBeGreaterThan(MAGNET.light.pull)
  })
})

describe("resolveMagnet", () => {
  it("ignores targets outside their pull radius", () => {
    const r = resolveMagnet({ x: 0, y: 0 }, [star("a", 500, 500)], null)
    expect(r.target).toBeNull()
    expect(r.captured).toBe(false)
    expect(r.point).toEqual({ x: 0, y: 0 })
  })

  it("pulls toward a target within its radius without capturing it", () => {
    const t = star("a", 200, 200)
    // 24px half-size + 60px away from the edge: inside the strong pull radius, outside capture.
    const r = resolveMagnet({ x: 200 - 24 - 60, y: 200 }, [t], null)
    expect(r.target?.id).toBe("a")
    expect(r.captured).toBe(false)
    expect(r.point.x).toBeGreaterThan(200 - 24 - 60)
    expect(r.point.x).toBeLessThan(200)
  })

  it("captures inside the capture radius", () => {
    const t = star("a", 200, 200)
    const r = resolveMagnet({ x: 200 - 24 - (MAGNET.strong.capture - 2), y: 200 }, [t], null)
    expect(r.captured).toBe(true)
    expect(r.target?.id).toBe("a")
  })

  it("picks the nearest of several targets", () => {
    const a = star("a", 100, 100)
    const b = star("b", 180, 100)
    expect(resolveMagnet({ x: 150, y: 100 }, [a, b], null).target?.id).toBe("b")
    expect(resolveMagnet({ x: 120, y: 100 }, [a, b], null).target?.id).toBe("a")
  })

  it("holds a capture a little past the capture radius (hysteresis)", () => {
    const t = star("a", 200, 200)
    const edge = MAGNET.strong.capture + 4
    const p = { x: 200 - 24 - edge, y: 200 }
    expect(resolveMagnet(p, [t], null).captured).toBe(false)
    expect(resolveMagnet(p, [t], "a").captured).toBe(true)
    const far = { x: 200 - 24 - MAGNET.strong.capture - MAGNET.release - 2, y: 200 }
    expect(resolveMagnet(far, [t], "a").captured).toBe(false)
  })

  it("captures a wide row when the pointer is on it", () => {
    const r = resolveMagnet({ x: 300, y: 130 }, [row("r", 100, 100)], null)
    expect(r.captured).toBe(true)
  })
})

describe("stepSpring", () => {
  const omega = 24
  it("converges to the target", () => {
    let s = { x: 0, v: 0 }
    for (let i = 0; i < 120; i++) s = stepSpring(s, 100, 1 / 60, omega, 0.8)
    expect(s.x).toBeCloseTo(100, 3)
    expect(Math.abs(s.v)).toBeLessThan(0.01)
  })

  it("is frame-rate independent", () => {
    const one = stepSpring({ x: 0, v: 0 }, 100, 0.12, omega, 0.8)
    let many = { x: 0, v: 0 }
    for (let i = 0; i < 12; i++) many = stepSpring(many, 100, 0.01, omega, 0.8)
    expect(many.x).toBeCloseTo(one.x, 6)
    expect(many.v).toBeCloseTo(one.v, 4)
  })

  it("overshoots when underdamped and never when critically damped", () => {
    const peak = (zeta: number) => {
      let s = { x: 0, v: 0 }
      let max = 0
      for (let i = 0; i < 240; i++) {
        s = stepSpring(s, 100, 1 / 120, omega, zeta)
        max = Math.max(max, s.x)
      }
      return max
    }
    expect(peak(0.6)).toBeGreaterThan(100.5)
    expect(peak(1)).toBeLessThanOrEqual(100.0001)
  })

  it("stays finite and on target after a huge dt", () => {
    const s = stepSpring({ x: 0, v: 50 }, 100, 5, omega, 0.8)
    expect(Number.isFinite(s.x)).toBe(true)
    expect(s.x).toBeCloseTo(100, 3)
  })

  it("does not move a settled spring", () => {
    expect(stepSpring({ x: 5, v: 0 }, 5, 0.016, omega, 0.8)).toEqual({ x: 5, v: 0 })
  })
})

describe("springProfile", () => {
  it("drops the overshoot for reduced motion but keeps it responsive", () => {
    expect(springProfile(false).zeta).toBeLessThan(1)
    expect(springProfile(true).zeta).toBe(1)
    expect(springProfile(true).omega).toBeGreaterThan(0)
  })
})

describe("placeTooltip", () => {
  const viewport = { width: 1000, height: 800 }
  const tip = { width: 120, height: 24 }

  it("sits centered above the anchor", () => {
    const p = placeTooltip({ cx: 500, top: 400, bottom: 440 }, tip, viewport)
    expect(p.x).toBe(500)
    expect(p.y).toBeLessThan(400)
    expect(p.below).toBe(false)
  })

  it("stays inside the viewport horizontally", () => {
    expect(placeTooltip({ cx: 10, top: 400, bottom: 440 }, tip, viewport).x).toBe(60 + 8)
    expect(placeTooltip({ cx: 995, top: 400, bottom: 440 }, tip, viewport).x).toBe(1000 - 60 - 8)
  })

  it("drops below the anchor when there is no room above", () => {
    const p = placeTooltip({ cx: 500, top: 10, bottom: 50 }, tip, viewport)
    expect(p.below).toBe(true)
    expect(p.y).toBeGreaterThan(50)
  })
})
