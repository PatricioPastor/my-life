import { describe, expect, it } from "vitest"
import {
  dueIn,
  initialOnboarding,
  journeyWanted,
  onboardingReducer,
  skipOffered,
  type OnboardingPhase,
  type OnboardingState,
} from "./onboarding-machine"

const D = { greeting: 4000, life: 5000, different: 4200 }

const start = (returning = false, now = 0): OnboardingState =>
  onboardingReducer(initialOnboarding, { type: "start", now, returning, greeting: "buenoniaa", durations: D })

/** Past the greeting, on the choice. */
const choosing = (returning = false, now = 0): OnboardingState =>
  onboardingReducer(start(returning, now), { type: "tick", now: now + D.greeting })

describe("onboarding machine", () => {
  it("waits idle until started, then greets", () => {
    expect(initialOnboarding.phase).toBe("idle")
    const s = start()
    expect(s.phase).toBe("greeting")
    expect(s.greeting).toBe("buenoniaa")
  })

  it("asks what the visitor came to see right after the greeting, and waits however long it takes", () => {
    let s = start(false, 100)
    s = onboardingReducer(s, { type: "tick", now: 100 + D.greeting - 1 })
    expect(s.phase).toBe("greeting")
    s = onboardingReducer(s, { type: "tick", now: 100 + D.greeting })
    expect(s.phase).toBe("choice")
    expect(dueIn(s, 100 + D.greeting)).toBeNull()
    expect(onboardingReducer(s, { type: "tick", now: 999999 })).toBe(s)
  })

  it("asks a returning visitor too", () => {
    expect(choosing(true).phase).toBe("choice")
  })

  it("plays the rest of a first visit once the visitor chooses the story, each phrase for its own duration", () => {
    let s = onboardingReducer(choosing(false, 100), { type: "chooseStory", now: 9000 })
    expect(s.phase).toBe("life")
    expect(s.enteredAt).toBe(9000)
    s = onboardingReducer(s, { type: "tick", now: 9000 + D.life - 1 })
    expect(s.phase).toBe("life")
    s = onboardingReducer(s, { type: "tick", now: 9000 + D.life })
    expect(s.phase).toBe("different")
    s = onboardingReducer(s, { type: "tick", now: 9000 + D.life + D.different - 1 })
    expect(s.phase).toBe("different")
    s = onboardingReducer(s, { type: "tick", now: 9000 + D.life + D.different })
    expect(s.phase).toBe("cta")
  })

  it("keeps the CTA until it is clicked, however long it takes", () => {
    let s = onboardingReducer(choosing(), { type: "chooseStory", now: D.greeting })
    let now = D.greeting
    for (const d of [D.life, D.different]) {
      now += d
      s = onboardingReducer(s, { type: "tick", now })
    }
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
    for (const phase of ["idle", "greeting", "life", "different", "cta", "story", "hardware", "done"] as const) {
      const other: OnboardingState = { ...start(), phase }
      expect(onboardingReducer(other, { type: "chooseStory", now: 1 })).toBe(other)
    }
  })

  it("takes a returning visitor who chooses the story straight to the gate", () => {
    const s = onboardingReducer(choosing(true), { type: "chooseStory", now: 9000 })
    expect(s.phase).toBe("done")
    expect(s.skipped).toBe(false)
  })

  it("skips to done from any phase of the story path and stays done", () => {
    for (const phase of ["life", "different", "cta", "story", "hardware"] as const) {
      const s = onboardingReducer({ ...start(), phase }, { type: "skip" })
      expect(s.phase).toBe("done")
      expect(s.skipped).toBe(true)
    }
    const done = onboardingReducer({ ...start(), phase: "hardware" }, { type: "enter" })
    expect(onboardingReducer(done, { type: "skip" })).toBe(done)
  })

  it("never skips past the choice: before it, skipping only reaches it sooner, and on it nothing happens", () => {
    for (const returning of [false, true]) {
      const early = onboardingReducer(start(returning), { type: "skip" })
      expect(early.phase).toBe("choice")
      expect(early.skipped).toBe(false)
      const s = choosing(returning)
      expect(onboardingReducer(s, { type: "skip" })).toBe(s)
    }
  })

  it("offers Saltar only on the story path: not before the choice, not on it, not once done", () => {
    const at = (phase: OnboardingPhase, replayed = false): OnboardingState => ({ ...start(), phase, replayed })
    for (const phase of ["idle", "greeting", "choice", "done"] as const) expect(skipOffered(at(phase)), phase).toBe(false)
    for (const phase of ["life", "different", "cta", "story", "hardware"] as const) expect(skipOffered(at(phase)), phase).toBe(true)
    // A replay is the story path from its first phrase: the visitor already chose it.
    expect(skipOffered(at("greeting", true))).toBe(true)
  })

  it("reports when the next timed step is due", () => {
    const s = start(false, 200)
    expect(dueIn(s, 500)).toBe(D.greeting - 300)
    expect(dueIn(s, 5000)).toBe(0)
    expect(dueIn({ ...s, phase: "cta" }, 500)).toBeNull()
    expect(dueIn(initialOnboarding, 0)).toBeNull()
  })
})

describe("replay", () => {
  const done = (returning: boolean): OnboardingState => ({ ...start(returning), phase: "done", returning, skipped: true })
  const replay = (s: OnboardingState, now = 9000) =>
    onboardingReducer(s, { type: "replay", now, greeting: "buenanochee", durations: D })

  it("restarts the full sequence from the greeting even after a returning (seen) visit", () => {
    let s = replay(done(true))
    expect(s.phase).toBe("greeting")
    expect(s.returning).toBe(false)
    expect(s.skipped).toBe(false)
    expect(s.greeting).toBe("buenanochee")
    expect(s.enteredAt).toBe(9000)
    // A returning greeting would jump to done; a replay walks every phase.
    s = onboardingReducer(s, { type: "tick", now: 9000 + D.greeting })
    expect(s.phase).toBe("life")
    s = onboardingReducer(s, { type: "tick", now: 9000 + D.greeting + D.life })
    expect(s.phase).toBe("different")
    s = onboardingReducer(s, { type: "tick", now: 9000 + D.greeting + D.life + D.different })
    expect(s.phase).toBe("cta")
  })

  it("only replays once the intro is done", () => {
    for (const phase of ["idle", "greeting", "life", "different", "cta", "story", "hardware"] as const) {
      const s: OnboardingState = { ...start(), phase }
      expect(replay(s)).toBe(s)
    }
  })

  it("keeps the journey mounted for the whole replay", () => {
    const s = replay(done(false))
    expect(s.phase).toBe("greeting")
    expect(journeyWanted(s)).toBe(true)
    expect(journeyWanted({ ...s, phase: "story" })).toBe(true)
  })

  it("can be skipped like the first run and replayed again", () => {
    const skipped = onboardingReducer(replay(done(true)), { type: "skip" })
    expect(skipped.phase).toBe("done")
    expect(replay(skipped).phase).toBe("greeting")
  })

  it("never asks again: the visitor already chose the story", () => {
    const s = onboardingReducer(replay(done(true)), { type: "tick", now: 9000 + D.greeting })
    expect(s.phase).toBe("life")
  })
})

describe("journeyWanted", () => {
  it("keeps the journey out of the way until the last step", () => {
    const s = start()
    expect(journeyWanted(initialOnboarding)).toBe(false)
    for (const phase of ["greeting", "choice", "life", "different", "cta", "story"] as const) {
      expect(journeyWanted({ ...s, phase })).toBe(false)
    }
    expect(journeyWanted({ ...s, phase: "hardware" })).toBe(true)
    expect(journeyWanted({ ...s, phase: "done" })).toBe(true)
  })

  it("mounts nothing for a returning visitor until they choose the story, so choosing the work loads no gate and no sky", () => {
    expect(journeyWanted(start(true))).toBe(false)
    expect(journeyWanted(choosing(true))).toBe(false)
    expect(journeyWanted(onboardingReducer(choosing(true), { type: "chooseStory", now: 1 }))).toBe(true)
  })
})
