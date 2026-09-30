import { letterTimeline, type LetterTimeline } from "./letter-timeline"

export type PhraseKind = "greeting" | "life" | "different"
export type PhaseDurations = Record<PhraseKind, number>

export const LIFE_PHRASE = "esta, es mi vida"
export const DIFFERENT_PHRASE = "pero narrada de una forma diferente"

/** How long each fully formed phrase stays. The last one hands over to the CTA after a short beat instead of leaving. */
const HOLD_MS: Record<PhraseKind, number> = { greeting: 2000, life: 2300, different: 700 }
/** A returning visitor only sees the greeting: a brief hold, no exit (the layer itself fades). */
const RETURNING_HOLD_MS = 600

export function phraseTimeline(kind: PhraseKind, text: string, returning: boolean): LetterTimeline {
  const quick = returning && kind === "greeting"
  return letterTimeline(text, text, {
    holdMs: quick ? RETURNING_HOLD_MS : HOLD_MS[kind],
    exit: kind !== "different" && !quick,
  })
}

/** Phase durations of the timed steps, straight from the timelines (nothing hard-coded to a single number). */
export function phaseDurations(greeting: string, returning: boolean): PhaseDurations {
  return {
    greeting: phraseTimeline("greeting", greeting, returning).totalMs,
    life: phraseTimeline("life", LIFE_PHRASE, returning).totalMs,
    different: phraseTimeline("different", DIFFERENT_PHRASE, returning).totalMs,
  }
}
