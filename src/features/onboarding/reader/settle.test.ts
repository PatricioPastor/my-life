import { describe, expect, it } from "vitest"
import { isSettled, settleProfile, stepSettle, type SettleState } from "./settle"

function simulate(profile: { omega: number; zeta: number }, dt: number, seconds: number, from: SettleState = { x: 0, v: 0 }, target = 1) {
  let s = from
  const xs: number[] = []
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    s = stepSettle(s, target, dt, profile)
    xs.push(s.x)
  }
  return { s, xs }
}

describe("settleProfile", () => {
  it("is slightly underdamped for the snap, critically damped under reduced motion", () => {
    expect(settleProfile(false).zeta).toBeCloseTo(0.8, 5)
    expect(settleProfile(true).zeta).toBe(1)
  })

  it("settles faster when motion is reduced", () => {
    expect(settleProfile(true).omega).toBeGreaterThan(settleProfile(false).omega)
  })
})

describe("stepSettle", () => {
  it("converges on the target", () => {
    const { s } = simulate(settleProfile(false), 1 / 60, 2)
    expect(s.x).toBeCloseTo(1, 3)
    expect(Math.abs(s.v)).toBeLessThan(0.01)
  })

  it("overshoots a little and comes back when underdamped: the bounce", () => {
    const { xs } = simulate(settleProfile(false), 1 / 120, 1.5)
    const peak = Math.max(...xs)
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThan(1.05)
  })

  it("never overshoots when critically damped", () => {
    const { xs } = simulate(settleProfile(true), 1 / 120, 1)
    expect(Math.max(...xs)).toBeLessThanOrEqual(1 + 1e-9)
  })

  it("gives the same result at any frame rate", () => {
    const p = settleProfile(false)
    const a = simulate(p, 1 / 30, 0.5).s
    const b = simulate(p, 1 / 240, 0.5).s
    expect(a.x).toBeCloseTo(b.x, 6)
    expect(a.v).toBeCloseTo(b.v, 6)
  })

  it("keeps the velocity when the target changes mid-flight", () => {
    const p = settleProfile(false)
    const mid = simulate(p, 1 / 60, 0.1).s
    expect(mid.v).toBeGreaterThan(0)
    const next = stepSettle(mid, 2, 1 / 60, p)
    expect(next.x).toBeGreaterThan(mid.x)
  })

  it("does nothing for a zero or negative step, or when already at rest on the target", () => {
    const p = settleProfile(false)
    const s = { x: 0.3, v: 1 }
    expect(stepSettle(s, 1, 0, p)).toBe(s)
    expect(stepSettle(s, 1, -1, p)).toBe(s)
    const rest = { x: 1, v: 0 }
    expect(stepSettle(rest, 1, 0.016, p)).toBe(rest)
  })
})

describe("isSettled", () => {
  it("is true only when both the distance and the speed are tiny", () => {
    expect(isSettled({ x: 1.0004, v: 0.001 }, 1)).toBe(true)
    expect(isSettled({ x: 1.2, v: 0 }, 1)).toBe(false)
    expect(isSettled({ x: 1, v: 0.5 }, 1)).toBe(false)
  })
})
