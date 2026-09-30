import { describe, expect, it } from "vitest"
import { DIFFERENT_PHRASE, LIFE_PHRASE, phaseDurations, phraseTimeline } from "./phrases"

describe("phrase timings", () => {
  it("runs the greeting and the middle phrase for about two seconds each (enter + hold + exit)", () => {
    for (const greeting of ["buenoniaa", "buenanochee"] as const) {
      const d = phaseDurations(greeting, false)
      expect(d.greeting).toBeGreaterThanOrEqual(1850)
      expect(d.greeting).toBeLessThanOrEqual(2100)
      expect(d.life).toBeGreaterThanOrEqual(1850)
      expect(d.life).toBeLessThanOrEqual(2100)
    }
  })

  it("forms the last phrase in about a second at most, then hands over to the CTA", () => {
    const t = phraseTimeline("different", DIFFERENT_PHRASE, false)
    expect(t.enterMs).toBeLessThanOrEqual(1100)
    expect(t.exitMs).toBe(0)
    expect(phaseDurations("buenoniaa", false).different).toBeLessThanOrEqual(1600)
  })

  it("matches each duration to its timeline total", () => {
    const d = phaseDurations("buenanochee", false)
    expect(d.greeting).toBe(phraseTimeline("greeting", "buenanochee", false).totalMs)
    expect(d.life).toBe(phraseTimeline("life", LIFE_PHRASE, false).totalMs)
    expect(d.different).toBe(phraseTimeline("different", DIFFERENT_PHRASE, false).totalMs)
  })

  it("holds the greeting and the middle phrase 0.7 s, and the last one a short beat with no exit", () => {
    expect(phraseTimeline("greeting", "buenoniaa", false).holdMs).toBe(700)
    expect(phraseTimeline("life", LIFE_PHRASE, false).holdMs).toBe(700)
    expect(phraseTimeline("different", DIFFERENT_PHRASE, false).holdMs).toBe(400)
    expect(phraseTimeline("different", DIFFERENT_PHRASE, false).exitMs).toBe(0)
  })

  it("keeps a returning visitor's greeting short: no exit, brief hold", () => {
    const t = phraseTimeline("greeting", "buenoniaa", true)
    expect(t.exitMs).toBe(0)
    expect(t.holdMs).toBe(300)
    expect(t.totalMs).toBeLessThan(phraseTimeline("greeting", "buenoniaa", false).totalMs)
    expect(t.totalMs).toBeLessThanOrEqual(1400)
  })
})
