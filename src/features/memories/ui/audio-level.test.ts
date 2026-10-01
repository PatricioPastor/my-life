import { describe, expect, it } from "vitest"
import { byteRms, laggedLevels, levelFromRms, pushLevel, smoothLevel, smoothedReader } from "./audio-level"

/** A time-domain buffer like the AnalyserNode gives: unsigned bytes centered on 128. */
const sine = (amplitude: number, length = 2048, cycles = 16) =>
  Uint8Array.from({ length }, (_, i) => Math.round(128 + 128 * amplitude * Math.sin((2 * Math.PI * cycles * i) / length)))

describe("byteRms", () => {
  it("is 0 for silence (every byte at the center) and for an empty buffer", () => {
    expect(byteRms(new Uint8Array(512).fill(128))).toBe(0)
    expect(byteRms(new Uint8Array(0))).toBe(0)
  })

  it("is the root mean square of the samples as fractions of full scale", () => {
    // A full-scale square wave swings the whole range: every sample is about one unit from the center.
    const square = Uint8Array.from({ length: 512 }, (_, i) => (i % 2 === 0 ? 0 : 255))
    expect(byteRms(square)).toBeGreaterThan(0.99)
    expect(byteRms(square)).toBeLessThanOrEqual(1)
  })

  it("reads a sine of amplitude A as A over the square root of 2", () => {
    expect(byteRms(sine(0.5))).toBeCloseTo(0.5 / Math.SQRT2, 2)
    expect(byteRms(sine(0.9))).toBeCloseTo(0.9 / Math.SQRT2, 2)
  })

  it("does not care about the sign of the swing", () => {
    expect(byteRms(Uint8Array.of(0, 0, 0, 0))).toBeCloseTo(byteRms(Uint8Array.of(255, 255, 255, 255)), 1)
  })
})

describe("levelFromRms", () => {
  it("turns hiss into nothing and a loud voice into 1", () => {
    expect(levelFromRms(0)).toBe(0)
    expect(levelFromRms(0.004)).toBe(0)
    expect(levelFromRms(0.3)).toBe(1)
    expect(levelFromRms(0.9)).toBe(1)
  })

  it("grows with the voice, and lifts a quiet one more than linearly so it is still seen", () => {
    const levels = [0.01, 0.03, 0.08, 0.15, 0.25].map(levelFromRms)
    expect([...levels].sort((a, b) => a - b)).toEqual(levels)
    expect(levelFromRms(0.1)).toBeGreaterThan(0.1 / 0.3)
  })

  it("stays within 0 to 1 whatever it is given", () => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, 0.1]) {
      const level = levelFromRms(value)
      expect(level).toBeGreaterThanOrEqual(0)
      expect(level).toBeLessThanOrEqual(1)
    }
  })
})

describe("smoothLevel", () => {
  it("rises faster than it falls, so a syllable pops and then lingers", () => {
    const rise = smoothLevel(0, 1, 50)
    const fall = 1 - smoothLevel(1, 0, 50)
    expect(rise).toBeGreaterThan(fall)
  })

  it("moves toward the target without overshooting it", () => {
    let level = 0
    for (let i = 0; i < 100; i++) {
      level = smoothLevel(level, 0.6, 16)
      expect(level).toBeLessThanOrEqual(0.6)
    }
    expect(level).toBeCloseTo(0.6, 2)
  })

  it("does not move when no time has passed, and gets there when a lot has", () => {
    expect(smoothLevel(0.3, 1, 0)).toBe(0.3)
    expect(smoothLevel(0.3, 1, 10_000)).toBeCloseTo(1, 5)
  })

  it("is not thrown off by a bad target or a negative step", () => {
    expect(smoothLevel(0.5, Number.NaN, 16)).toBeLessThan(0.5)
    expect(smoothLevel(0.5, 0.9, -16)).toBe(0.5)
  })
})

describe("pushLevel and laggedLevels", () => {
  it("keeps only the most recent levels", () => {
    expect(pushLevel([0.1, 0.2, 0.3], 0.4, 3)).toEqual([0.2, 0.3, 0.4])
    expect(pushLevel([], 0.4, 3)).toEqual([0.4])
  })

  it("does not change the history it was given", () => {
    const history = [0.1]
    pushLevel(history, 0.2, 5)
    expect(history).toEqual([0.1])
  })

  it("reads the level as it was a while ago, for each ripple", () => {
    // Frames of 100 ms, the newest last: a ripple lagging 200 ms shows the level from two frames before the newest.
    expect(laggedLevels([0.1, 0.2, 0.3, 0.4, 0.5], 100, [0, 200, 400])).toEqual([0.5, 0.3, 0.1])
  })

  it("answers 0 for a ripple that reaches back before the voice began", () => {
    expect(laggedLevels([0.5], 100, [0, 100, 300])).toEqual([0.5, 0, 0])
    expect(laggedLevels([], 100, [0, 100])).toEqual([0, 0])
  })
})

describe("smoothedReader", () => {
  const clock = (start = 0) => {
    let now = start
    return { now: () => now, tick: (ms: number) => (now += ms) }
  }

  it("follows a raw reader with the same attack and release as the form's orb", () => {
    const time = clock()
    let raw = 0
    const read = smoothedReader(() => raw, time.now)
    expect(read()).toBe(0)
    raw = 1
    time.tick(70)
    // One attack time constant: about 63% of the way up, exactly what `smoothLevel` gives.
    expect(read()).toBeCloseTo(smoothLevel(0, 1, 70), 6)
    time.tick(1000)
    const peak = read()
    expect(peak).toBeGreaterThan(0.99)
    raw = 0
    time.tick(240)
    expect(read()).toBeCloseTo(smoothLevel(peak, 0, 240), 6)
  })

  it("does not move when no time has passed, and gets there when a lot has", () => {
    expect(smoothLevel(0.3, 1, 0)).toBe(0.3)
    expect(smoothLevel(0.3, 1, 10_000)).toBeCloseTo(1, 5)
  })

  it("is not thrown off by a bad target or a negative step", () => {
    expect(smoothLevel(0.5, Number.NaN, 16)).toBeLessThan(0.5)
    expect(smoothLevel(0.5, 0.9, -16)).toBe(0.5)
  })
})

describe("pushLevel and laggedLevels", () => {
  it("keeps only the most recent levels", () => {
    expect(pushLevel([0.1, 0.2, 0.3], 0.4, 3)).toEqual([0.2, 0.3, 0.4])
    expect(pushLevel([], 0.4, 3)).toEqual([0.4])
  })

  it("does not change the history it was given", () => {
    const history = [0.1]
    pushLevel(history, 0.2, 5)
    expect(history).toEqual([0.1])
  })

  it("reads the level as it was a while ago, for each ripple", () => {
    // Frames of 100 ms, the newest last: a ripple lagging 200 ms shows the level from two frames before the newest.
    expect(laggedLevels([0.1, 0.2, 0.3, 0.4, 0.5], 100, [0, 200, 400])).toEqual([0.5, 0.3, 0.1])
  })

  it("answers 0 for a ripple that reaches back before the voice began", () => {
    expect(laggedLevels([0.5], 100, [0, 100, 300])).toEqual([0.5, 0, 0])
    expect(laggedLevels([], 100, [0, 100])).toEqual([0, 0])
  })
})

describe("smoothedReader", () => {
  const clock = (start = 0) => {
    let now = start
    return { now: () => now, tick: (ms: number) => (now += ms) }
  }

  it("follows a raw reader with the same attack and release as the form's orb", () => {
    const time = clock()
    let raw = 0
    const read = smoothedReader(() => raw, time.now)
    expect(read()).toBe(0)
    raw = 1
    time.tick(70)
    // One attack time constant: about 63% of the way up, exactly what `smoothLevel` gives.
    expect(read()).toBeCloseTo(smoothLevel(0, 1, 70), 6)
    time.tick(1000)
    expect(read()).toBeGreaterThan(0.99)
    raw = 0
    time.tick(240)
    const falling = read()
    expect(falling).toBeCloseTo(smoothLevel(read() === falling ? smoothLevel(0, 1, 1070) : 0, 0, 240), 1)
    expect(falling).toBeLessThan(0.5)
    expect(falling).toBeGreaterThan(0)
  })

  it("does not move when it is read twice in the same instant", () => {
    const time = clock()
    const read = smoothedReader(() => 1, time.now)
    time.tick(50)
    const first = read()
    expect(read()).toBe(first)
  })

  it("never goes past 0..1, whatever the raw reader says", () => {
    const time = clock()
    const read = smoothedReader(() => 7, time.now)
    time.tick(10_000)
    expect(read()).toBeLessThanOrEqual(1)
  })
})
