import { describe, expect, it } from "vitest"
import {
  FOCUS_IN_S,
  FOCUS_OUT_S,
  SETTLE_END,
  armsAt,
  easeFocus,
  flickerAt,
  focusFx,
  segmentsFor,
  stepFocusAmount,
  swellAt,
} from "./focus"

describe("stepFocusAmount", () => {
  it("rises to 1 in about FOCUS_IN_S and falls to 0 in about FOCUS_OUT_S", () => {
    let a = 0
    for (let i = 0; i < 100; i++) a = stepFocusAmount(a, 1, FOCUS_IN_S / 100)
    expect(a).toBeCloseTo(1, 5)
    for (let i = 0; i < 100; i++) a = stepFocusAmount(a, 0, FOCUS_OUT_S / 100)
    expect(a).toBeCloseTo(0, 5)
  })

  it("never overshoots or goes negative, and holds at dt 0", () => {
    expect(stepFocusAmount(0.9, 1, 10)).toBe(1)
    expect(stepFocusAmount(0.1, 0, 10)).toBe(0)
    expect(stepFocusAmount(0.4, 1, 0)).toBe(0.4)
  })

  it("is frame-rate independent", () => {
    let a = 0
    for (let i = 0; i < 10; i++) a = stepFocusAmount(a, 1, 0.02)
    expect(a).toBeCloseTo(stepFocusAmount(0, 1, 0.2), 9)
  })
})

describe("easeFocus", () => {
  it("is a monotone smoothstep from 0 to 1", () => {
    expect(easeFocus(0)).toBe(0)
    expect(easeFocus(1)).toBe(1)
    expect(easeFocus(0.5)).toBeCloseTo(0.5)
    let last = -1
    for (let a = 0; a <= 1; a += 0.05) {
      const e = easeFocus(a)
      expect(e).toBeGreaterThanOrEqual(last)
      last = e
    }
  })
})

describe("segmentsFor", () => {
  it("is deterministic per seed and differs across seeds", () => {
    expect(segmentsFor(4, 8, 0.05, 0.22, 0.2, 1)).toEqual(segmentsFor(4, 8, 0.05, 0.22, 0.2, 1))
    expect(segmentsFor(4, 8, 0.05, 0.22, 0.2, 1)).not.toEqual(segmentsFor(5, 8, 0.05, 0.22, 0.2, 1))
  })

  it("keeps durations and values inside their ranges, and holds are irregular", () => {
    const segs = segmentsFor(11, 20, 0.05, 0.22, 0.2, 1)
    for (const s of segs) {
      expect(s.duration).toBeGreaterThanOrEqual(0.05)
      expect(s.duration).toBeLessThanOrEqual(0.22)
      expect(s.value).toBeGreaterThanOrEqual(0.2)
      expect(s.value).toBeLessThanOrEqual(1)
    }
    expect(new Set(segs.map((s) => s.duration.toFixed(3))).size).toBeGreaterThan(10)
  })
})

describe("flickerAt", () => {
  const sample = (seed: number, from: number, to: number, step: number) => {
    const out: number[] = []
    for (let t = from; t <= to; t += step) out.push(flickerAt(t, seed))
    return out
  }

  it("is deterministic", () => {
    expect(flickerAt(0.37, 3)).toBe(flickerAt(0.37, 3))
    expect(flickerAt(0.37, 3)).not.toBe(flickerAt(0.37, 4))
  })

  it("stays inside a visible range", () => {
    for (const v of sample(3, 0, 3, 0.01)) {
      expect(v).toBeGreaterThan(0.2)
      expect(v).toBeLessThanOrEqual(1.05)
    }
  })

  it("holds its intensity for short spans then jumps, without strobing", () => {
    const v = sample(3, 0, 1, 0.002)
    const flat = v.filter((x, i) => i > 0 && Math.abs(x - v[i - 1]) < 1e-3).length
    expect(flat / v.length).toBeGreaterThan(0.5)
    // Eased edges: no single 2 ms step ever jumps the full range.
    let maxJump = 0
    for (let i = 1; i < v.length; i++) maxJump = Math.max(maxJump, Math.abs(v[i] - v[i - 1]))
    expect(maxJump).toBeLessThan(0.35)
    // Yet it does change several times in the first second.
    let changes = 0
    for (let i = 1; i < v.length; i++) if (Math.abs(v[i] - v[i - 1]) > 0.02) changes++
    expect(changes).toBeGreaterThan(0)
    expect(new Set(v.map((x) => x.toFixed(2))).size).toBeGreaterThan(5)
  })

  it("settles near full brightness with only a subtle shimmer after the reveal", () => {
    for (const v of sample(3, SETTLE_END + 0.1, 8, 0.05)) {
      expect(v).toBeGreaterThan(0.9)
      expect(v).toBeLessThan(1.06)
    }
  })

  it("treats negative time as the start", () => {
    expect(flickerAt(-1, 3)).toBe(flickerAt(0, 3))
  })
})

describe("swellAt", () => {
  it("grows from normal to about 1.4x over about 0.6 s", () => {
    expect(swellAt(0)).toBeCloseTo(1, 5)
    expect(swellAt(0.6)).toBeGreaterThan(1.35)
    expect(swellAt(0.6)).toBeLessThan(1.45)
    let last = 0
    for (let t = 0; t <= 0.6; t += 0.05) {
      expect(swellAt(t)).toBeGreaterThanOrEqual(last)
      last = swellAt(t)
    }
  })

  it("then idles close to 1.4x", () => {
    for (let t = 1; t < 6; t += 0.1) {
      expect(swellAt(t)).toBeGreaterThan(1.3)
      expect(swellAt(t)).toBeLessThan(1.5)
    }
  })
})

describe("armsAt", () => {
  it("gives four irregular arm lengths that settle together", () => {
    const early = armsAt(0.3, 5)
    expect(early).toHaveLength(4)
    expect(new Set(early.map((x) => x.toFixed(3))).size).toBeGreaterThan(1)
    const late = armsAt(4, 5)
    for (const a of late) {
      expect(a).toBeGreaterThan(1)
      expect(a).toBeLessThan(1.3)
    }
  })

  it("can jitter well past and below the resting length while wild", () => {
    let lo = Infinity
    let hi = -Infinity
    for (let t = 0; t < 1; t += 0.01) for (const a of armsAt(t, 5)) {
      lo = Math.min(lo, a)
      hi = Math.max(hi, a)
    }
    expect(lo).toBeLessThan(0.9)
    expect(hi).toBeGreaterThan(1.3)
  })
})

describe("focusFx", () => {
  it("bundles the flicker, swell and arms for one focus time", () => {
    const fx = focusFx(0.5, 2)
    expect(fx.flicker).toBe(flickerAt(0.5, 2 + 1))
    expect(fx.swell).toBe(swellAt(0.5))
    expect(fx.arms).toEqual(armsAt(0.5, 2 + 2))
  })
})
