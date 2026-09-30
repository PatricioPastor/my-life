import { describe, expect, it } from "vitest"
import {
  MAGNET,
  bendAmount,
  distanceToRect,
  placeTooltip,
  resolveMagnet,
  shouldForwardClick,
  springProfile,
  stepFollow,
  stepSpring,
  type FollowState,
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

  it("lets a target under the pointer beat a held neighbour (what you see is what you click)", () => {
    const held = row("held", 100, 100)
    const under = row("under", 100, 180)
    // The pointer is inside "under" but still within the release band of the held row above it.
    expect(resolveMagnet({ x: 300, y: 182 }, [held, under], "held").target?.id).toBe("under")
    // Off every rect, the held capture still wins as before.
    expect(resolveMagnet({ x: 300, y: 176 }, [held, under], "held").target?.id).toBe("held")
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
  it("is always critically damped so the magnetic offset never overshoots, and stays quick", () => {
    expect(springProfile(false).zeta).toBe(1)
    expect(springProfile(true).zeta).toBe(1)
    expect(springProfile(false).omega).toBeGreaterThanOrEqual(24)
    expect(springProfile(true).omega).toBeGreaterThan(0)
  })
})

describe("stepFollow", () => {
  const rest: FollowState = { ox: { x: 0, v: 0 }, oy: { x: 0, v: 0 } }
  const { omega } = springProfile(false)

  it("places the reticle exactly on the pointer when nothing pulls (no lag, any dt)", () => {
    for (const dt of [0, 0.004, 0.016, 0.05]) {
      const r = stepFollow(rest, { x: 640, y: 480 }, { x: 640, y: 480 }, dt, omega)
      expect(r.position).toEqual({ x: 640, y: 480 })
    }
  })

  it("follows a fast sweep with zero lag while free", () => {
    let f = rest
    for (let i = 0; i < 60; i++) {
      const pointer = { x: i * 25, y: 300 + i * 4 }
      const r = stepFollow(f, pointer, pointer, 1 / 60, omega)
      f = r.follow
      expect(r.position).toEqual(pointer)
    }
  })

  it("eases only the magnetic offset toward the want point, without overshoot", () => {
    const pointer = { x: 100, y: 100 }
    const want = { x: 140, y: 100 }
    let f = rest
    let max = 0
    for (let i = 0; i < 120; i++) {
      const r = stepFollow(f, pointer, want, 1 / 120, omega)
      f = r.follow
      max = Math.max(max, r.position.x)
      expect(r.position.y).toBe(100)
    }
    expect(max).toBeLessThanOrEqual(140.0001)
    expect(f.ox.x).toBeCloseTo(40, 2)
    const first = stepFollow(rest, pointer, want, 1 / 60, omega)
    expect(first.position.x).toBeGreaterThan(100)
    expect(first.position.x).toBeLessThan(140)
  })

  it("keeps the pointer 1:1 underneath the offset while captured", () => {
    let f = rest
    for (let i = 0; i < 90; i++) f = stepFollow(f, { x: 100, y: 100 }, { x: 140, y: 100 }, 1 / 60, omega).follow
    const moved = stepFollow(f, { x: 103, y: 100 }, { x: 140, y: 100 }, 0, omega)
    expect(moved.position.x).toBeCloseTo(103 + f.ox.x, 6)
  })

  it("releases smoothly: the offset decays back to zero", () => {
    let f: FollowState = { ox: { x: 40, v: 0 }, oy: { x: 0, v: 0 } }
    for (let i = 0; i < 120; i++) f = stepFollow(f, { x: 100, y: 100 }, { x: 100, y: 100 }, 1 / 60, omega).follow
    expect(Math.abs(f.ox.x)).toBeLessThan(0.01)
  })
})

describe("shouldForwardClick", () => {
  const base = { capturedId: "a", insideCaptured: false, detail: 1 }
  it("forwards a pointer click that landed outside the captured element", () => {
    expect(shouldForwardClick(base)).toBe(true)
  })
  it("does not double-activate a click that already landed on the captured element", () => {
    expect(shouldForwardClick({ ...base, insideCaptured: true })).toBe(false)
  })
  it("does nothing when nothing is captured", () => {
    expect(shouldForwardClick({ ...base, capturedId: null })).toBe(false)
  })
  it("leaves keyboard activation alone (detail 0)", () => {
    expect(shouldForwardClick({ ...base, detail: 0 })).toBe(false)
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
