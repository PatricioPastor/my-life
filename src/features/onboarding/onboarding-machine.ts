import type { Greeting } from "./greeting"
import type { PhaseDurations } from "./phrases"

export type OnboardingPhase = "idle" | "greeting" | "life" | "different" | "cta" | "story" | "hardware" | "done"

export interface OnboardingState {
  phase: OnboardingPhase
  /** Timestamp (injected) at which the current phase began. */
  enteredAt: number
  /** Total time of each timed phase, from the letter timelines (injected, never hard-coded here). */
  durations: PhaseDurations
  greeting: Greeting
  returning: boolean
  skipped: boolean
}

export type OnboardingEvent =
  | { type: "start"; now: number; returning: boolean; greeting: Greeting; durations: PhaseDurations }
  | { type: "tick"; now: number }
  | { type: "cta" }
  | { type: "continue" }
  | { type: "enter" }
  | { type: "skip" }

export const initialOnboarding: OnboardingState = {
  phase: "idle",
  enteredAt: 0,
  durations: { greeting: 0, life: 0, different: 0 },
  greeting: "buenoniaa",
  returning: false,
  skipped: false,
}

const TIMED_NEXT: Partial<Record<OnboardingPhase, OnboardingPhase>> = {
  greeting: "life",
  life: "different",
  different: "cta",
}

function isTimed(s: OnboardingState): boolean {
  return s.phase in TIMED_NEXT
}

function holdFor(s: OnboardingState): number {
  return s.phase === "greeting" || s.phase === "life" || s.phase === "different" ? s.durations[s.phase] : 0
}

export function onboardingReducer(state: OnboardingState, event: OnboardingEvent): OnboardingState {
  switch (event.type) {
    case "start":
      if (state.phase !== "idle") return state
      return {
        ...state,
        phase: "greeting",
        enteredAt: event.now,
        returning: event.returning,
        greeting: event.greeting,
        durations: event.durations,
      }
    case "tick": {
      if (!isTimed(state) || event.now - state.enteredAt < holdFor(state)) return state
      // A returning visitor only sees the greeting, then the gate.
      const next = state.phase === "greeting" && state.returning ? "done" : TIMED_NEXT[state.phase]!
      return { ...state, phase: next, enteredAt: event.now }
    }
    case "cta":
      return state.phase === "cta" ? { ...state, phase: "story" } : state
    case "continue":
      return state.phase === "story" ? { ...state, phase: "hardware" } : state
    case "enter":
      return state.phase === "hardware" ? { ...state, phase: "done" } : state
    case "skip":
      return state.phase === "idle" || state.phase === "done" ? state : { ...state, phase: "done", skipped: true }
  }
}

/** Milliseconds until the next timed step, or null when the phase waits for the visitor. */
export function dueIn(state: OnboardingState, now: number): number | null {
  if (!isTimed(state)) return null
  return Math.max(0, state.enteredAt + holdFor(state) - now)
}

/** The heavy journey (sky, tunnel) is mounted early enough to be ready when the layer leaves, but not while text animates. */
export function journeyWanted(state: OnboardingState): boolean {
  return state.phase === "hardware" || state.phase === "done" || (state.returning && state.phase !== "idle")
}
