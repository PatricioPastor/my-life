import { describe, expect, it } from "vitest"
import { ENTER_CAP_MS, JITTER_MS, letterTimeline, STEP_MS } from "./letter-timeline"

const OPTS = { holdMs: 700, exit: true }

describe("letterTimeline", () => {
  it("marks spaces and gives them no animation", () => {
    const t = letterTimeline("esta, es", "s", OPTS)
    expect(t.letters.map((l) => l.char).join("")).toBe("esta, es")
    for (const l of t.letters) {
      if (l.char === " ") expect(l.space).toBe(true)
      else expect(l.space).toBe(false)
    }
    const space = t.letters.find((l) => l.space)!
    expect(space.dx).toBe(0)
    expect(space.dur).toBe(0)
  })

  it("is deterministic per seed and differs across seeds", () => {
    const a = letterTimeline("esta, es mi vida", "one", OPTS)
    const b = letterTimeline("esta, es mi vida", "one", OPTS)
    const c = letterTimeline("esta, es mi vida", "two", OPTS)
    expect(a).toEqual(b)
    expect(a.letters.map((l) => l.dx)).not.toEqual(c.letters.map((l) => l.dx))
  })

  it("keeps every origin inside its irregular range", () => {
    const t = letterTimeline("pero narrada de una forma diferente", "range", OPTS)
    const moving = t.letters.filter((l) => !l.space)
    expect(moving.length).toBeGreaterThan(20)
    for (const l of moving) {
      expect(Math.abs(l.dx)).toBeGreaterThanOrEqual(28)
      expect(Math.abs(l.dx)).toBeLessThanOrEqual(60)
      expect(Math.abs(l.dy)).toBeGreaterThanOrEqual(28)
      expect(Math.abs(l.dy)).toBeLessThanOrEqual(60)
      expect(Math.abs(l.rot)).toBeGreaterThanOrEqual(8)
      expect(Math.abs(l.rot)).toBeLessThanOrEqual(18)
      expect(l.scale).toBeGreaterThanOrEqual(0.85)
      expect(l.scale).toBeLessThanOrEqual(0.95)
      expect(l.blur).toBeGreaterThanOrEqual(4)
      expect(l.blur).toBeLessThanOrEqual(6)
      expect(l.dur).toBeGreaterThanOrEqual(550)
      expect(l.dur).toBeLessThanOrEqual(700)
    }
    // Irregular: not every letter starts on the same side.
    expect(new Set(moving.map((l) => Math.sign(l.dx))).size).toBe(2)
    expect(new Set(moving.map((l) => Math.sign(l.dy))).size).toBe(2)
  })

  it("staggers left to right: delays never go backwards", () => {
    const t = letterTimeline("pero narrada de una forma diferente", "order", OPTS)
    const delays = t.letters.filter((l) => !l.space).map((l) => l.delay)
    expect(delays[0]).toBeGreaterThanOrEqual(0)
    for (let i = 1; i < delays.length; i++) expect(delays[i]).toBeGreaterThan(delays[i - 1]!)
  })

  it("derives every phase from the letters, not from constants", () => {
    const t = letterTimeline("esta, es mi vida", "sum", OPTS)
    const end = Math.max(...t.letters.filter((l) => !l.space).map((l) => l.delay + l.dur))
    expect(t.enterMs).toBe(end)
    expect(t.holdMs).toBe(700)
    expect(t.exitMs).toBeGreaterThanOrEqual(230)
    expect(t.exitMs).toBeLessThanOrEqual(300)
    expect(t.totalMs).toBe(t.enterMs + t.holdMs + t.exitMs)
    expect(t.exitAtMs).toBe(t.enterMs + t.holdMs)
  })

  it("caps the assembly at about a second whatever the phrase length", () => {
    for (const text of ["buenoniaa", "buenanochee", "esta, es mi vida", "pero narrada de una forma diferente", "a".repeat(120)]) {
      for (const seed of ["a", "b", "c", text]) {
        expect(letterTimeline(text, seed, OPTS).enterMs, text).toBeLessThanOrEqual(ENTER_CAP_MS)
      }
    }
  })

  it("squeezes the stagger for long phrases but never above the base step, keeping the order", () => {
    const short = letterTimeline("ab", "x", OPTS)
    const long = letterTimeline("pero narrada de una forma diferente", "x", OPTS)
    const gap = (t: typeof short) => {
      const d = t.letters.filter((l) => !l.space).map((l) => l.delay)
      return (d[d.length - 1]! - d[0]!) / (d.length - 1)
    }
    expect(gap(short)).toBeLessThanOrEqual(STEP_MS + JITTER_MS)
    expect(gap(long)).toBeLessThan(gap(short))
    const delays = long.letters.filter((l) => !l.space).map((l) => l.delay)
    for (let i = 1; i < delays.length; i++) expect(delays[i]).toBeGreaterThan(delays[i - 1]!)
  })

  it("grows with the phrase (until the cap) and drops the exit when asked", () => {
    const short = letterTimeline("ab", "x", { holdMs: 700, exit: false })
    const long = letterTimeline("pero narrada de una forma diferente", "x", { holdMs: 700, exit: false })
    expect(long.enterMs).toBeGreaterThanOrEqual(short.enterMs)
    expect(short.exitMs).toBe(0)
    expect(short.totalMs).toBe(short.enterMs + 700)
  })
})
