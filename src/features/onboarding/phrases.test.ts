import { describe, expect, it } from "vitest"
import { DIFFERENT_PHRASE, LIFE_PHRASE, phaseDurations, phraseTimeline } from "./phrases"

describe("phrase timings", () => {
  it("holds each phrase noticeably longer than before (>= 3.5 s)", () => {
    for (const greeting of ["buenoniaa", "buenanochee"] as const) {
      const d = phaseDurations(greeting, false)
      expect(d.greeting).toBeGreaterThanOrEqual(3500)
      expect(d.life).toBeGreaterThanOrEqual(3500)
      expect(d.different).toBeGreaterThanOrEqual(3500)
    }
  })

  it("matches each duration to its timeline total", () => {
    const d = phaseDurations("buenanochee", false)
    expect(d.greeting).toBe(phraseTimeline("greeting", "buenanochee", false).totalMs)
    expect(d.life).toBe(phraseTimeline("life", LIFE_PHRASE, false).totalMs)
    expect(d.different).toBe(phraseTimeline("different", DIFFERENT_PHRASE, false).totalMs)
  })

  it("holds the greeting 2 s, the middle phrase 2.3 s and gives the last one no exit", () => {
    expect(phraseTimeline("greeting", "buenoniaa", false).holdMs).toBe(2000)
    expect(phraseTimeline("life", LIFE_PHRASE, false).holdMs).toBe(2300)
    expect(phraseTimeline("different", DIFFERENT_PHRASE, false).exitMs).toBe(0)
  })

  it("keeps a returning visitor's greeting short: no exit, brief hold", () => {
    const t = phraseTimeline("greeting", "buenoniaa", true)
    expect(t.exitMs).toBe(0)
    expect(t.totalMs).toBeLessThan(phraseTimeline("greeting", "buenoniaa", false).totalMs)
  })
})
