import { letterTimeline, type LetterTimeline } from "./letter-timeline"

export type PhraseKind = "greeting" | "life" | "different"
export type PhaseDurations = Record<PhraseKind, number>

export const LIFE_PHRASE = "esta, es mi vida"
export const DIFFERENT_PHRASE = "pero narrada de una forma diferente"

/** Every first-visit phrase lasts exactly this long: enter + hold + exit (the last one has no exit, then the CTA). The hold is derived from it. */
export const CYCLE_MS = 3200
/** A returning visitor only sees the greeting: a brief hold, no exit (the layer itself fades). */
const RETURNING_HOLD_MS = 300

export function phraseTimeline(kind: PhraseKind, text: string, returning: boolean): LetterTimeline {
  const quick = returning && kind === "greeting"
  return letterTimeline(text, text, {
    ...(quick ? { holdMs: RETURNING_HOLD_MS } : { cycleMs: CYCLE_MS }),
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
