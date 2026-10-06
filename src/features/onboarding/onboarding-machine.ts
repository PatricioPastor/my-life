import type { Greeting } from "./greeting"
import type { PhaseDurations } from "./phrases"

/** `choice` follows the greeting: the visitor picks the work (another page) or the story (the rest of this intro). */
export type OnboardingPhase = "idle" | "greeting" | "choice" | "life" | "different" | "cta" | "story" | "hardware" | "done"

export interface OnboardingState {
  phase: OnboardingPhase
  /** Timestamp (injected) at which the current phase began. */
  enteredAt: number
  /** Total time of each timed phase, from the letter timelines (injected, never hard-coded here). */
  durations: PhaseDurations
  greeting: Greeting
  returning: boolean
  skipped: boolean
  /** True once the visitor asked to see the intro again: the journey is already up and must stay mounted. */
  replayed: boolean
}

export type OnboardingEvent =
  | { type: "start"; now: number; returning: boolean; greeting: Greeting; durations: PhaseDurations }
  | { type: "replay"; now: number; greeting: Greeting; durations: PhaseDurations }
  | { type: "tick"; now: number }
  | { type: "chooseStory"; now: number }
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
  replayed: false,
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

/** The greeting leads to the choice, except in a replay: whoever asks to see the intro again already chose the story. */
function beforeChoice(s: OnboardingState): boolean {
  return s.phase === "greeting" && !s.replayed
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
    case "replay":
      // Always the full sequence, whatever the remembered "seen" flag said the first time.
      if (state.phase !== "done") return state
      return {
        ...state,
        phase: "greeting",
        enteredAt: event.now,
        returning: false,
        skipped: false,
        replayed: true,
        greeting: event.greeting,
        durations: event.durations,
      }
    case "tick": {
      if (!isTimed(state) || event.now - state.enteredAt < holdFor(state)) return state
      const next = beforeChoice(state) ? "choice" : TIMED_NEXT[state.phase]!
      return { ...state, phase: next, enteredAt: event.now }
    }
    case "chooseStory":
      if (state.phase !== "choice") return state
      // A returning visitor goes straight to the gate, as before the choice existed; a first visit plays the rest.
      return { ...state, phase: state.returning ? "done" : "life", enteredAt: event.now }
    case "cta":
      return state.phase === "cta" ? { ...state, phase: "story" } : state
    case "continue":
      return state.phase === "story" ? { ...state, phase: "hardware" } : state
    case "enter":
      return state.phase === "hardware" ? { ...state, phase: "done" } : state
    case "skip":
      // The choice is never skipped: before it, skipping only gets there sooner (the choice waits, so it needs no clock).
      if (beforeChoice(state)) return { ...state, phase: "choice" }
      return skipOffered(state) ? { ...state, phase: "done", skipped: true } : state
  }
}

/** Milliseconds until the next timed step, or null when the phase waits for the visitor. */
export function dueIn(state: OnboardingState, now: number): number | null {
  if (!isTimed(state)) return null
  return Math.max(0, state.enteredAt + holdFor(state) - now)
}

/** "Saltar" belongs to the story path only: never before the choice, never on it, and not once the intro is done. */
export function skipOffered(state: OnboardingState): boolean {
  return state.phase !== "idle" && state.phase !== "choice" && state.phase !== "done" && !beforeChoice(state)
}

/**
 * The heavy journey (gate, sky, tunnel) is mounted early enough to be ready when the layer leaves, but not while text
 * animates, and never before the visitor chose the story: whoever picks the work leaves without it. A returning visitor
 * goes from the choice straight to done, so theirs mounts while the layer fades (its chunk is already fetched).
 */
export function journeyWanted(state: OnboardingState): boolean {
  return state.replayed || state.phase === "hardware" || state.phase === "done"
}
