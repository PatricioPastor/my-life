import { describe, expect, it } from "vitest"
import { CYCLE_MS, DIFFERENT_PHRASE, LIFE_PHRASE, phaseDurations, phraseTimeline } from "./phrases"

describe("phrase timings", () => {
  it("runs every first-visit phrase for exactly 3.2 seconds", () => {
    expect(CYCLE_MS).toBe(3200)
    for (const greeting of ["buenoniaa", "buenanochee"] as const) {
      const d = phaseDurations(greeting, false)
      expect(d.greeting, greeting).toBe(3200)
      expect(d.life).toBe(3200)
      expect(d.different).toBe(3200)
    }
  })

  it("forms the last phrase within 1.3 s, then holds until the cycle ends with no exit", () => {
    const t = phraseTimeline("different", DIFFERENT_PHRASE, false)
    expect(t.enterMs).toBeLessThanOrEqual(1300)
    expect(t.exitMs).toBe(0)
    expect(t.enterMs + t.holdMs).toBe(3200)
  })

  it("matches each duration to its timeline total", () => {
    const d = phaseDurations("buenanochee", false)
    expect(d.greeting).toBe(phraseTimeline("greeting", "buenanochee", false).totalMs)
    expect(d.life).toBe(phraseTimeline("life", LIFE_PHRASE, false).totalMs)
    expect(d.different).toBe(phraseTimeline("different", DIFFERENT_PHRASE, false).totalMs)
  })

  it("holds the greeting and the middle phrase well over a second, with an exit", () => {
    for (const [kind, text] of [["greeting", "buenoniaa"], ["greeting", "buenanochee"], ["life", LIFE_PHRASE]] as const) {
      const t = phraseTimeline(kind, text, false)
      expect(t.holdMs, text).toBeGreaterThan(1000)
      expect(t.exitMs).toBeGreaterThan(0)
      expect(t.enterMs + t.holdMs + t.exitMs).toBe(3200)
    }
  })

  it("keeps a returning visitor's greeting short: no exit, brief hold", () => {
    const t = phraseTimeline("greeting", "buenoniaa", true)
    expect(t.exitMs).toBe(0)
    expect(t.holdMs).toBe(300)
    expect(t.totalMs).toBe(t.enterMs + 300)
    expect(t.totalMs).toBeLessThan(phraseTimeline("greeting", "buenoniaa", false).totalMs)
  })
})
