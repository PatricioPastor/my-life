import { describe, expect, it } from "vitest"
import {
  MAX_PARTICLES,
  createParticles,
  emissionRate,
  particleAlpha,
  particleSpeed,
  stepParticles,
  type Particles,
} from "./orb-particles"

/** A repeatable stand-in for Math.random: a small linear congruential generator. */
function seeded(seed = 7) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

const DIAMETER = 400
const run = (p: Particles, ms: number, level: number, emitting = true, step = 16, rand = seeded()) => {
  for (let t = 0; t < ms; t += step) stepParticles(p, step, { level, emitting, diameter: DIAMETER, rand })
}
const distance = (p: Particles, i: number) => Math.hypot(p.x[i], p.y[i])

describe("emissionRate", () => {
  it("is nothing for silence and for the hiss under it", () => {
    expect(emissionRate(0)).toBe(0)
    expect(emissionRate(0.02)).toBe(0)
  })

  it("grows with the level and never falls back as it rises", () => {
    let last = 0
    for (let level = 0.05; level <= 1.0001; level += 0.05) {
      const rate = emissionRate(level)
      expect(rate).toBeGreaterThanOrEqual(last)
      last = rate
    }
    expect(emissionRate(0.9)).toBeGreaterThan(emissionRate(0.3) * 1.5)
  })

  it("is finite and bounded for anything it is given", () => {
    expect(emissionRate(5)).toBe(emissionRate(1))
    expect(emissionRate(-1)).toBe(0)
    expect(emissionRate(Number.NaN)).toBe(0)
    expect(Number.isFinite(emissionRate(Number.POSITIVE_INFINITY))).toBe(true)
  })
})

describe("particleSpeed", () => {
  it("is faster for a louder voice and for a bigger sphere", () => {
    expect(particleSpeed(0.9, DIAMETER)).toBeGreaterThan(particleSpeed(0.2, DIAMETER))
    expect(particleSpeed(0.5, 600)).toBeGreaterThan(particleSpeed(0.5, 300))
  })

  it("is positive even for a whisper", () => {
    expect(particleSpeed(0, DIAMETER)).toBeGreaterThan(0)
  })
})

describe("particleAlpha", () => {
  it("is invisible when born, shows quickly, and fades to nothing at the end of its life", () => {
    expect(particleAlpha(0, 1)).toBe(0)
    expect(particleAlpha(0.15, 1)).toBeGreaterThan(0.5)
    expect(particleAlpha(0.6, 1)).toBeGreaterThan(particleAlpha(0.9, 1))
    expect(particleAlpha(1, 1)).toBe(0)
  })

  it("stays between 0 and 1, and is 0 for a life with no length", () => {
    for (let age = -0.5; age <= 1.5; age += 0.1) {
      const a = particleAlpha(age, 1)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThanOrEqual(1)
    }
    expect(particleAlpha(0.5, 0)).toBe(0)
  })
})

describe("stepParticles", () => {
  it("throws nothing off for a silent or paused voice", () => {
    const p = createParticles()
    run(p, 2000, 0, true)
    expect(p.count).toBe(0)
    run(p, 2000, 0.9, false)
    expect(p.count).toBe(0)
  })

  it("throws particles off at about the rate the level asks for", () => {
    const p = createParticles()
    // Short enough that nothing has died yet.
    run(p, 400, 0.6)
    const expected = (emissionRate(0.6) * 400) / 1000
    expect(p.count).toBeGreaterThan(expected * 0.7)
    expect(p.count).toBeLessThan(expected * 1.3)
  })

  it("throws more off for a louder voice", () => {
    const quiet = createParticles()
    const loud = createParticles()
    run(quiet, 600, 0.2)
    run(loud, 600, 0.9)
    expect(loud.count).toBeGreaterThan(quiet.count)
  })

  it("never keeps more than its capacity alive, however loud and long", () => {
    const p = createParticles(40)
    run(p, 20000, 1)
    expect(p.count).toBeLessThanOrEqual(40)
    expect(createParticles().x.length).toBe(MAX_PARTICLES)
  })

  it("lets them go from the rim of the sphere, moving outward", () => {
    const p = createParticles()
    run(p, 200, 0.8)
    expect(p.count).toBeGreaterThan(0)
    for (let i = 0; i < p.count; i++) {
      expect(distance(p, i)).toBeGreaterThan(DIAMETER * 0.4)
      // Moving away from the center: velocity points along the position.
      expect(p.x[i] * p.vx[i] + p.y[i] * p.vy[i]).toBeGreaterThan(0)
    }
  })

  it("carries them further out as they live", () => {
    const p = createParticles()
    stepParticles(p, 50, { level: 1, emitting: true, diameter: DIAMETER, rand: seeded() })
    const before = Array.from({ length: p.count }, (_, i) => distance(p, i))
    expect(before.length).toBeGreaterThan(0)
    stepParticles(p, 50, { level: 1, emitting: false, diameter: DIAMETER })
    expect(p.count).toBe(before.length)
    before.forEach((d, i) => expect(distance(p, i)).toBeGreaterThan(d))
  })

  it("keeps them close enough that the canvas around the sphere never clips one that is still visible", () => {
    const p = createParticles()
    run(p, 12000, 1)
    for (let i = 0; i < p.count; i++) expect(distance(p, i)).toBeLessThan(DIAMETER * 1.3)
  })

  it("lets the ones in flight fade out once the voice stops, and then holds none", () => {
    const p = createParticles()
    run(p, 1500, 0.9)
    expect(p.count).toBeGreaterThan(5)
    run(p, 4000, 0.9, false)
    expect(p.count).toBe(0)
  })

  it("does not move without time, and a long gap (a hidden tab) is not a burst", () => {
    const p = createParticles()
    stepParticles(p, 0, { level: 1, emitting: true, diameter: DIAMETER, rand: seeded() })
    expect(p.count).toBe(0)
    stepParticles(p, 60000, { level: 1, emitting: true, diameter: DIAMETER, rand: seeded() })
    expect(p.count).toBeLessThan(10)
  })

  it("allocates nothing as it runs: the same arrays, frame after frame", () => {
    const p = createParticles()
    const before = [p.x, p.y, p.vx, p.vy, p.age, p.life, p.size]
    run(p, 3000, 0.7)
    const after = [p.x, p.y, p.vx, p.vy, p.age, p.life, p.size]
    after.forEach((array, i) => expect(array).toBe(before[i]))
  })

  it("keeps every live particle valid: finite, with a life to live and a size to draw", () => {
    const p = createParticles()
    run(p, 5000, 0.8)
    for (let i = 0; i < p.count; i++) {
      for (const array of [p.x, p.y, p.vx, p.vy, p.age, p.life, p.size]) expect(Number.isFinite(array[i])).toBe(true)
      expect(p.age[i]).toBeLessThan(p.life[i])
      expect(p.size[i]).toBeGreaterThan(0)
    }
  })
})
