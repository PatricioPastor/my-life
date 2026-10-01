import { describe, expect, it } from "vitest"
import { SHIELD_REACH, orbUniforms, type SkyOrb } from "./orb-uniforms"

const orb = (over: Partial<SkyOrb> = {}): SkyOrb => ({
  x: 300,
  y: 200,
  radius: 40,
  energy: 1,
  color: [0.4, 0.8, 0.9],
  fringe: 0.06,
  peek: 0,
  lens: 36,
  ...over,
})

describe("orbUniforms", () => {
  it("sends nothing when there is no orb: no glow, no lens, no shield", () => {
    const u = orbUniforms(null, 900)
    expect(u.orb).toEqual([0, 0, 0, 0])
    expect(u.lens).toEqual([0, 0, 0, 0])
  })

  it("flips the orb's y into the sky's y-up space and passes its radius, energy, colour and fringe", () => {
    const u = orbUniforms(orb(), 900)
    expect(u.orb).toEqual([300, 700, 40, 1])
    expect(u.color).toEqual([0.4, 0.8, 0.9])
    expect(u.fringe).toBe(0.06)
  })

  it("leaves the sky's cursor light alone while the orb only floats", () => {
    const u = orbUniforms(orb({ peek: 0 }), 900)
    expect(u.lens[0]).toBe(0)
    expect(u.lens[3]).toBe(0)
  })

  it("holds the cursor light back (the amber backdrop) once the orb peeks, over a wider area than the lens", () => {
    const u = orbUniforms(orb({ peek: 1, lens: 72 }), 900)
    expect(u.lens[0]).toBe(1)
    expect(u.lens[1]).toBe(72)
    expect(u.lens[3]).toBe(1)
    expect(u.lens[2]).toBeCloseTo(72 * SHIELD_REACH, 6)
    expect(SHIELD_REACH).toBeGreaterThan(2)
  })

  it("eases the shield in with the peek and out with the orb's own fade", () => {
    expect(orbUniforms(orb({ peek: 0.5 }), 900).lens[3]).toBeCloseTo(0.5, 6)
    expect(orbUniforms(orb({ peek: 1, energy: 0.25 }), 900).lens[3]).toBeCloseTo(0.25, 6)
    expect(orbUniforms(orb({ peek: 1, energy: 0 }), 900).lens[3]).toBe(0)
  })

  it("clamps out-of-range inputs", () => {
    const u = orbUniforms(orb({ peek: 4, energy: 3, lens: -5 }), 900)
    expect(u.lens[0]).toBe(1)
    expect(u.lens[1]).toBe(0)
    expect(u.lens[2]).toBe(0)
    expect(u.lens[3]).toBe(1)
    expect(orbUniforms(orb({ peek: -1 }), 900).lens[0]).toBe(0)
  })
})
