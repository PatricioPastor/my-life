import { letterTimeline, type LetterTimeline } from "./letter-timeline"

export type PhraseKind = "greeting" | "life" | "different" | "choice"
/** The phrases that time their own phase; the choice's question stays until the visitor answers it. */
export type TimedPhraseKind = Exclude<PhraseKind, "choice">
export type PhaseDurations = Record<TimedPhraseKind, number>

export const LIFE_PHRASE = "esta, es mi vida"
export const DIFFERENT_PHRASE = "pero narrada de una forma diferente"
/** Asked right after the greeting. Lowercase, like every phrase set in Gambarino. */
export const CHOICE_PHRASE = "¿qué vienes a ver?"

/** Every first-visit phrase lasts exactly this long: enter + hold + exit (the last one has no exit, then the CTA). The hold is derived from it. */
export const CYCLE_MS = 3200
/** A returning visitor's greeting holds only briefly before it leaves for the choice. */
const RETURNING_HOLD_MS = 300

export function phraseTimeline(kind: PhraseKind, text: string, returning: boolean): LetterTimeline {
  const quick = returning && kind === "greeting"
  return letterTimeline(text, text, {
    ...(quick ? { holdMs: RETURNING_HOLD_MS } : { cycleMs: CYCLE_MS }),
    // The last phrase stays for the CTA and the question for its answers; the others make way for what follows.
    exit: kind === "greeting" || kind === "life",
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
