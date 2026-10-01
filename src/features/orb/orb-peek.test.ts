import { describe, expect, it } from "vitest"
import {
  LENS_SHARE,
  PEEK_MAX_SCALE,
  lensRadius,
  peekScale,
  stepPeek,
  type PeekSpace,
} from "./orb-peek"

const DT = 1 / 60
const run = (from: number, want: number, seconds: number, reduced = false) => {
  const values = [from]
  for (let i = 0; i < Math.round(seconds / DT); i++) values.push(stepPeek(values.at(-1)!, want, DT, reduced))
  return values
}

describe("stepPeek", () => {
  it("rises monotonically toward 1 and stays inside 0..1", () => {
    const v = run(0, 1, 1.5)
    for (let i = 1; i < v.length; i++) {
      expect(v[i]).toBeGreaterThanOrEqual(v[i - 1])
      expect(v[i]).toBeLessThanOrEqual(1)
      expect(v[i]).toBeGreaterThanOrEqual(0)
    }
    expect(v.at(-1)).toBe(1)
  })

  it("falls monotonically back to 0", () => {
    const v = run(1, 0, 1.5)
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeLessThanOrEqual(v[i - 1])
    expect(v.at(-1)).toBe(0)
  })

  it("is a strong ease-out: most of the move in the first frames, settled in about 350 to 500 ms", () => {
    const v = run(0, 1, 1)
    const at = (ms: number) => v[Math.round((ms / 1000) / DT)]
    // Fast start: no ease-in, so the first frame already moves a good share.
    expect(v[1]).toBeGreaterThan(0.08)
    expect(at(120)).toBeGreaterThan(0.5)
    expect(at(350)).toBeGreaterThan(0.9)
    expect(at(500)).toBeGreaterThan(0.97)
    // Never an ease-in: the step size only ever shrinks (the last sliver snaps to the target, so stop short of it).
    const steps = v.slice(1).map((x, i) => x - v[i])
    for (let i = 1; i < steps.length && v[i + 1] < 0.99; i++) expect(steps[i]).toBeLessThanOrEqual(steps[i - 1] + 1e-12)
  })

  it("lets go a touch slower than it grabs, and still lands within half a second", () => {
    const up = run(0, 1, 1)
    const down = run(1, 0, 1)
    expect(down[Math.round(0.12 / DT)]).toBeGreaterThan(1 - up[Math.round(0.12 / DT)])
    expect(down[Math.round(0.5 / DT)]).toBeLessThan(0.05)
  })

  it("is interruptible: reversing midway continues from the current value, with no jump", () => {
    const rising = run(0, 1, 0.12)
    const mid = rising.at(-1)!
    expect(mid).toBeGreaterThan(0.2)
    expect(mid).toBeLessThan(0.95)
    const turned = stepPeek(mid, 0, DT, false)
    expect(Math.abs(turned - mid)).toBeLessThan(0.15)
    expect(turned).toBeLessThan(mid)
    // And again, back toward 1 from partway down.
    const back = stepPeek(turned, 1, DT, false)
    expect(back).toBeGreaterThan(turned)
    expect(Math.abs(back - turned)).toBeLessThan(0.15)
  })

  it("holds still when the target is reached or time does not advance", () => {
    expect(stepPeek(1, 1, DT, false)).toBe(1)
    expect(stepPeek(0, 0, DT, false)).toBe(0)
    expect(stepPeek(0.4, 1, 0, false)).toBe(0.4)
    expect(stepPeek(0.4, 1, -1, false)).toBe(0.4)
  })

  it("clamps a wild value or target, and one long stalled frame, to 0..1", () => {
    expect(stepPeek(3, 1, DT, false)).toBeLessThanOrEqual(1)
    expect(stepPeek(-3, 0, DT, false)).toBeGreaterThanOrEqual(0)
    expect(stepPeek(0.5, 9, 5, false)).toBe(1)
    expect(stepPeek(0.5, -9, 5, false)).toBe(0)
  })

  it("under reduced motion is a short, even crossfade rather than an ease", () => {
    const v = run(0, 1, 0.5, true)
    const steps = v.slice(1, 5).map((x, i) => x - v[i + 1 - 1])
    for (const s of steps) expect(s).toBeCloseTo(steps[0], 6)
    expect(v[Math.round(0.1 / DT)]).toBeGreaterThan(0.3)
    expect(v[Math.round(0.25 / DT)]).toBe(1)
    const down = run(1, 0, 0.5, true)
    expect(down[Math.round(0.25 / DT)]).toBe(0)
  })
})

const space = (over: Partial<PeekSpace> = {}): PeekSpace => ({
  x: 720,
  y: 450,
  radius: 40,
  width: 1440,
  height: 900,
  keepOut: [],
  ...over,
})

describe("peekScale", () => {
  it("zooms to the full target in open sky", () => {
    expect(peekScale(space())).toBe(PEEK_MAX_SCALE)
  })

  it("takes a target between 1.6 and 2.2, so the window is a real step up in size", () => {
    expect(PEEK_MAX_SCALE).toBeGreaterThanOrEqual(1.6)
    expect(PEEK_MAX_SCALE).toBeLessThanOrEqual(2.2)
  })

  it("never lets the lens cross a viewport edge", () => {
    for (const x of [30, 50, 70, 100, 200]) {
      for (const [w, h, y] of [[1440, 900, 450], [390, 844, 400]] as const) {
        const s = space({ x, y, width: w, height: h })
        const scale = peekScale(s)
        const edge = Math.min(s.x, s.y, s.width - s.x, s.height - s.y)
        expect(lensRadius(s.radius, scale, 1)).toBeLessThanOrEqual(Math.max(edge, s.radius * LENS_SHARE))
      }
    }
  })

  it("never lets the lens touch a keep-out box", () => {
    const box = { left: 600, top: 100, right: 840, bottom: 190 }
    for (let y = 200; y <= 520; y += 20) {
      const s = space({ y, keepOut: [box] })
      const scale = peekScale(s)
      const gap = Math.max(box.left - s.x, 0, s.x - box.right) ** 2 + Math.max(box.top - s.y, 0, s.y - box.bottom) ** 2
      expect(lensRadius(s.radius, scale, 1)).toBeLessThanOrEqual(Math.max(Math.sqrt(gap), s.radius * LENS_SHARE))
    }
  })

  it("shrinks smoothly as the orb nears a box: no jump from one position to the next", () => {
    const box = { left: 600, top: 100, right: 840, bottom: 190 }
    let prev = peekScale(space({ y: 520, keepOut: [box] }))
    for (let y = 519; y >= 200; y--) {
      const next = peekScale(space({ y, keepOut: [box] }))
      expect(Math.abs(next - prev)).toBeLessThan(0.05)
      prev = next
    }
    expect(prev).toBeLessThan(PEEK_MAX_SCALE)
  })

  it("never shrinks below the orb's own size, even squeezed", () => {
    const tight = space({ x: 20, y: 20, keepOut: [{ left: 0, top: 0, right: 15, bottom: 15 }] })
    expect(peekScale(tight)).toBe(1)
  })

  it("does not zoom at all under reduced motion", () => {
    expect(peekScale(space({ reduced: true }))).toBe(1)
  })

  it("is a pure function of where the orb is", () => {
    expect(peekScale(space({ x: 300, y: 300 }))).toBe(peekScale(space({ x: 300, y: 300 })))
  })
})

describe("lensRadius", () => {
  it("is the glow's own size at rest and grows with the peek and the scale", () => {
    expect(lensRadius(40, 2, 0)).toBeCloseTo(40 * LENS_SHARE, 6)
    expect(lensRadius(40, 2, 1)).toBeCloseTo(40 * LENS_SHARE * 2, 6)
    expect(lensRadius(40, 2, 0.5)).toBeGreaterThan(lensRadius(40, 2, 0.25))
    expect(lensRadius(40, 1, 1)).toBeCloseTo(lensRadius(40, 1, 0), 6)
  })
})
