import { describe, expect, it } from "vitest"
import { PARALLAX_EASE_MS, PARALLAX_REST, stepParallax, type ParallaxState } from "./parallax"

const DT = 1 / 60

function run(s: ParallaxState, raw: { x: number; y: number }, frozen: boolean, frames: number): ParallaxState {
  let next = s
  for (let i = 0; i < frames; i++) next = stepParallax(next, raw, frozen, DT)
  return next
}

describe("stepParallax", () => {
  it("applies the raw shift exactly while never frozen (no added lag)", () => {
    const s = stepParallax(PARALLAX_REST, { x: 12, y: -7 }, false, DT)
    expect(s.x).toBe(12)
    expect(s.y).toBe(-7)
  })

  it("holds the applied shift while frozen, however far the raw shift moves", () => {
    const held = run(PARALLAX_REST, { x: 10, y: 4 }, false, 1)
    const frozen = run(held, { x: 40, y: -30 }, true, 30)
    expect(frozen.x).toBe(10)
    expect(frozen.y).toBe(4)
  })

  it("eases toward the latest raw shift on release instead of snapping", () => {
    const held = run(PARALLAX_REST, { x: 10, y: 4 }, false, 1)
    const frozen = run(held, { x: 40, y: -30 }, true, 30)
    const first = stepParallax(frozen, { x: 40, y: -30 }, false, DT)
    // No discontinuity: the first released frame moves only a small fraction of the 30 px gap.
    expect(Math.abs(first.x - frozen.x)).toBeLessThan(2)
    expect(Math.abs(first.y - frozen.y)).toBeLessThan(3)
    expect(first.x).toBeGreaterThan(frozen.x)
  })

  it("settles within about 250 ms and then follows the raw shift exactly", () => {
    const held = run(PARALLAX_REST, { x: 0, y: 0 }, false, 1)
    const frozen = run(held, { x: 40, y: 0 }, true, 10)
    const frames = Math.round((PARALLAX_EASE_MS / 1000) / DT)
    const eased = run(frozen, { x: 40, y: 0 }, false, frames)
    expect(Math.abs(40 - eased.x)).toBeLessThan(40 * 0.06)
    const done = run(eased, { x: 40, y: 0 }, false, 60)
    expect(done.x).toBe(40)
    expect(done.easing).toBe(false)
    const follow = stepParallax(done, { x: 43, y: 0 }, false, DT)
    expect(follow.x).toBe(43)
  })

  it("never overshoots (critically damped)", () => {
    const frozen = run(run(PARALLAX_REST, { x: 0, y: 0 }, false, 1), { x: 60, y: 0 }, true, 5)
    let s = frozen
    for (let i = 0; i < 90; i++) {
      s = stepParallax(s, { x: 60, y: 0 }, false, DT)
      expect(s.x).toBeLessThanOrEqual(60)
    }
  })

  it("is frame-rate independent", () => {
    const frozen = run(run(PARALLAX_REST, { x: 0, y: 0 }, false, 1), { x: 50, y: 0 }, true, 5)
    const coarse = run(frozen, { x: 50, y: 0 }, false, 6) // 6 x 1/60 s = 100 ms
    let fine = frozen
    for (let i = 0; i < 12; i++) fine = stepParallax(fine, { x: 50, y: 0 }, false, 1 / 120)
    expect(coarse.x).toBeCloseTo(fine.x, 6)
  })

  it("keeps easing without a jump when the raw shift moves during the return", () => {
    const frozen = run(run(PARALLAX_REST, { x: 0, y: 0 }, false, 1), { x: 50, y: 0 }, true, 5)
    const mid = run(frozen, { x: 50, y: 0 }, false, 4)
    const next = stepParallax(mid, { x: 20, y: 0 }, false, DT)
    expect(Math.abs(next.x - mid.x)).toBeLessThan(6)
  })

  it("re-freezes cleanly in the middle of an eased return", () => {
    const frozen = run(run(PARALLAX_REST, { x: 0, y: 0 }, false, 1), { x: 50, y: 0 }, true, 5)
    const mid = run(frozen, { x: 50, y: 0 }, false, 4)
    const again = run(mid, { x: 50, y: 0 }, true, 10)
    expect(again.x).toBe(mid.x)
    expect(again.vx).toBe(0)
  })
})
