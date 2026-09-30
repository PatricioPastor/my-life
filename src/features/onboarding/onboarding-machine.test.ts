import { describe, expect, it } from "vitest"
import { HOLD_MS, dueIn, initialOnboarding, journeyWanted, onboardingReducer, type OnboardingState } from "./onboarding-machine"

const start = (returning = false, now = 0): OnboardingState =>
  onboardingReducer(initialOnboarding, { type: "start", now, returning, greeting: "buenoniaa" })

describe("onboarding machine", () => {
  it("waits idle until started, then greets", () => {
    expect(initialOnboarding.phase).toBe("idle")
    const s = start()
    expect(s.phase).toBe("greeting")
    expect(s.greeting).toBe("buenoniaa")
  })

  it("holds each text phase for 1500 ms and then moves on", () => {
    let s = start(false, 100)
    s = onboardingReducer(s, { type: "tick", now: 100 + HOLD_MS - 1 })
    expect(s.phase).toBe("greeting")
    s = onboardingReducer(s, { type: "tick", now: 100 + HOLD_MS })
    expect(s.phase).toBe("life")
    s = onboardingReducer(s, { type: "tick", now: 100 + HOLD_MS * 2 - 1 })
    expect(s.phase).toBe("life")
    s = onboardingReducer(s, { type: "tick", now: 100 + HOLD_MS * 2 })
    expect(s.phase).toBe("different")
    s = onboardingReducer(s, { type: "tick", now: 100 + HOLD_MS * 3 })
    expect(s.phase).toBe("cta")
  })

  it("keeps the CTA until it is clicked, however long it takes", () => {
    let s = start()
    for (const t of [1500, 3000, 4500]) s = onboardingReducer(s, { type: "tick", now: t })
    expect(s.phase).toBe("cta")
    s = onboardingReducer(s, { type: "tick", now: 999999 })
    expect(s.phase).toBe("cta")
    s = onboardingReducer(s, { type: "cta" })
    expect(s.phase).toBe("story")
  })

  it("moves story -> hardware -> done on continue and enter", () => {
    let s: OnboardingState = { ...start(), phase: "story" }
    s = onboardingReducer(s, { type: "continue" })
    expect(s.phase).toBe("hardware")
    s = onboardingReducer(s, { type: "enter" })
    expect(s.phase).toBe("done")
  })

  it("ignores events that do not belong to the current phase", () => {
    const s = start()
    expect(onboardingReducer(s, { type: "cta" })).toBe(s)
    expect(onboardingReducer(s, { type: "continue" })).toBe(s)
    expect(onboardingReducer(s, { type: "enter" })).toBe(s)
    expect(onboardingReducer(initialOnboarding, { type: "tick", now: 5000 })).toBe(initialOnboarding)
  })

  it("lets a returning visitor go from the greeting straight to done", () => {
    let s = start(true)
    expect(s.phase).toBe("greeting")
    s = onboardingReducer(s, { type: "tick", now: HOLD_MS })
    expect(s.phase).toBe("done")
  })

  it("skips to done from any active phase and stays done", () => {
    for (const phase of ["greeting", "life", "different", "cta", "story", "hardware"] as const) {
      const s = onboardingReducer({ ...start(), phase }, { type: "skip" })
      expect(s.phase).toBe("done")
      expect(s.skipped).toBe(true)
    }
    const done = onboardingReducer({ ...start(), phase: "hardware" }, { type: "enter" })
    expect(onboardingReducer(done, { type: "skip" })).toBe(done)
  })

  it("reports when the next timed step is due", () => {
    const s = start(false, 200)
    expect(dueIn(s, 500)).toBe(1200)
    expect(dueIn(s, 5000)).toBe(0)
    expect(dueIn({ ...s, phase: "cta" }, 500)).toBeNull()
    expect(dueIn(initialOnboarding, 0)).toBeNull()
  })
})

describe("journeyWanted", () => {
  it("keeps the journey out of the way until the last step, or a returning visit", () => {
    const s = start()
    expect(journeyWanted(initialOnboarding)).toBe(false)
    for (const phase of ["greeting", "life", "different", "cta", "story"] as const) {
      expect(journeyWanted({ ...s, phase })).toBe(false)
    }
    expect(journeyWanted({ ...s, phase: "hardware" })).toBe(true)
    expect(journeyWanted({ ...s, phase: "done" })).toBe(true)
    expect(journeyWanted(start(true))).toBe(true)
  })
})
