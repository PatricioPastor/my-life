import { autoPanStep, panSteps } from "./layout"

/**
 * The focused-reading state machine. Pure: time is injected through `tick`, so nothing here knows about timers or the DOM.
 *
 * One paragraph is active. It paints word by word on its timeline; when it is done and has rested for `settleMs`, the next
 * one takes the focus. A user gesture (`goto`, `next`, `prev`) overrides that: the paragraph being left is completed at once.
 */

export interface ParagraphPlan {
  /** When each word starts to paint, in ms from the moment the paragraph took the focus. */
  wordStarts: readonly number[]
  /** When the paragraph is done, in the same time base. */
  endMs: number
}

export interface ReaderPlan {
  paragraphs: readonly ParagraphPlan[]
  /** How long a finished paragraph rests before the next one takes over by itself. */
  settleMs: number
}

export interface ReaderState {
  activeIndex: number
  /** Words painted in each paragraph. A paragraph that was left is always fully painted. */
  painted: readonly number[]
  /** ms since the active paragraph took the focus. */
  clock: number
  /** The `now` of the last tick, or null until the first tick after a focus change. */
  lastNow: number | null
  /**
   * `auto`: the active paragraph is painting on its own and will hand over by itself.
   * `manual`: it is already read (the visitor came back to it, or it is the last one): it stays put until a gesture.
   */
  mode: "auto" | "manual"
  /** Every word of the story is painted. */
  completed: boolean
  /** Pan step inside the active paragraph, when it is taller than the reading area (0 is its start). */
  pan: number
  /** The last pan step the painting itself asked for, so the visitor's own panning is never undone. */
  follow: number
  /** How many reading areas tall each paragraph is at its focus scale (see layout.panRatios); 1 until measured. */
  ratios: readonly number[]
}

export type ReaderEvent =
  | { type: "tick"; now: number }
  | { type: "goto"; index: number }
  | { type: "next" }
  | { type: "prev" }
  | { type: "measure"; ratios: readonly number[] }

/** A tick after a stall (a hidden tab, a throttled timer) advances the clock by at most this, so it never leaps ahead. */
export const MAX_TICK_MS = 1000

const wordCount = (plan: ReaderPlan, i: number): number => plan.paragraphs[i]!.wordStarts.length
const stepsOf = (s: ReaderState, i: number): number => panSteps(s.ratios[i] ?? 1)
const isRead = (plan: ReaderPlan, painted: readonly number[], i: number): boolean => painted[i]! >= wordCount(plan, i)

function withCompleted(plan: ReaderPlan, s: ReaderState): ReaderState {
  const completed = plan.paragraphs.every((_, i) => isRead(plan, s.painted, i))
  return completed === s.completed ? s : { ...s, completed }
}

export function initReader(plan: ReaderPlan): ReaderState {
  return withCompleted(plan, {
    activeIndex: 0,
    painted: plan.paragraphs.map(() => 0),
    clock: 0,
    lastNow: null,
    mode: plan.paragraphs.length > 0 && wordCount(plan, 0) > 0 ? "auto" : "manual",
    completed: false,
    pan: 0,
    follow: 0,
    ratios: plan.paragraphs.map(() => 1),
  })
}

/** Overall progress: the share of words painted, as an integer 0-100. Only exactly 100 once every word is painted. */
export function readerProgress(plan: ReaderPlan, s: ReaderState): number {
  let total = 0
  let done = 0
  plan.paragraphs.forEach((p, i) => {
    total += p.wordStarts.length
    done += Math.min(s.painted[i]!, p.wordStarts.length)
  })
  return total === 0 ? 100 : Math.floor((100 * done) / total)
}

export function canContinue(plan: ReaderPlan, s: ReaderState): boolean {
  return readerProgress(plan, s) === 100
}

/** How many words of a paragraph have started by `clock`. */
function paintedAt(starts: readonly number[], clock: number): number {
  let n = 0
  while (n < starts.length && starts[n]! <= clock) n++
  return n
}

/** Fully paint paragraph `i`, leaving the rest as it is. */
function complete(plan: ReaderPlan, painted: readonly number[], i: number): readonly number[] {
  if (isRead(plan, painted, i)) return painted
  const next = painted.slice()
  next[i] = wordCount(plan, i)
  return next
}

function activate(plan: ReaderPlan, s: ReaderState, painted: readonly number[], index: number, pan = 0): ReaderState {
  return withCompleted(plan, {
    ...s,
    activeIndex: index,
    painted,
    clock: 0,
    lastNow: null,
    pan,
    follow: 0,
    mode: isRead(plan, painted, index) ? "manual" : "auto",
  })
}

function goto(plan: ReaderPlan, s: ReaderState, requested: number): ReaderState {
  const index = Math.min(plan.paragraphs.length - 1, Math.max(0, requested))
  if (index === s.activeIndex || plan.paragraphs.length === 0) return s
  // Leaving paragraphs forward completes every one passed over; going back only completes the one being left.
  let painted = s.painted
  const from = s.activeIndex
  const to = index > from ? index - 1 : from
  for (let i = from; i <= to; i++) painted = complete(plan, painted, i)
  // Coming back to a paragraph lands on its end, where the visitor left it.
  return activate(plan, s, painted, index, index < from ? stepsOf(s, index) : 0)
}

function tick(plan: ReaderPlan, s: ReaderState, now: number): ReaderState {
  if (plan.paragraphs.length === 0) return s
  if (s.lastNow === null) s = { ...s, lastNow: now }
  else {
    const dt = Math.min(MAX_TICK_MS, Math.max(0, now - s.lastNow))
    s = { ...s, lastNow: now, clock: s.clock + (s.mode === "auto" ? dt : 0) }
  }
  if (s.mode === "manual") return s

  for (;;) {
    const p = plan.paragraphs[s.activeIndex]!
    const n = paintedAt(p.wordStarts, s.clock)
    if (n > s.painted[s.activeIndex]!) {
      const painted = s.painted.slice()
      painted[s.activeIndex] = n
      s = { ...s, painted }
    }
    // Keep the word being painted in view: pan when it reaches the edge of the reading area.
    const want = autoPanStep(s.ratios[s.activeIndex] ?? 1, s.painted[s.activeIndex]! / p.wordStarts.length)
    if (want > s.follow) s = { ...s, follow: want, pan: Math.max(s.pan, want) }
    if (s.clock < p.endMs) break
    const last = s.activeIndex === plan.paragraphs.length - 1
    if (last) {
      s = { ...s, mode: "manual", painted: complete(plan, s.painted, s.activeIndex) }
      break
    }
    if (s.clock < p.endMs + plan.settleMs) break
    // Rested long enough: hand over, keeping the clock's remainder so the rhythm does not drift.
    const carry = s.clock - (p.endMs + plan.settleMs)
    s = { ...activate(plan, s, complete(plan, s.painted, s.activeIndex), s.activeIndex + 1), lastNow: now, clock: carry }
    if (s.mode === "manual") break
  }
  return withCompleted(plan, s)
}

export function readerStep(plan: ReaderPlan, s: ReaderState, event: ReaderEvent): ReaderState {
  switch (event.type) {
    case "tick":
      return tick(plan, s, event.now)
    case "goto":
      return goto(plan, s, event.index)
    case "measure": {
      if (event.ratios.length === s.ratios.length && event.ratios.every((r, i) => r === s.ratios[i])) return s
      const next = { ...s, ratios: event.ratios }
      return { ...next, pan: Math.min(s.pan, stepsOf(next, s.activeIndex)) }
    }
    case "prev":
      if (plan.paragraphs.length > 0 && s.pan > 0) return { ...s, pan: s.pan - 1 }
      return goto(plan, s, s.activeIndex - 1)
    case "next": {
      if (plan.paragraphs.length === 0) return s
      // Pan down the paragraph first; only once its end is in view does the next gesture move on.
      if (s.pan < stepsOf(s, s.activeIndex)) return { ...s, pan: s.pan + 1 }
      if (s.activeIndex < plan.paragraphs.length - 1) return goto(plan, s, s.activeIndex + 1)
      // On the last paragraph there is nowhere to go: finish painting it instead.
      const painted = complete(plan, s.painted, s.activeIndex)
      if (painted === s.painted && s.mode === "manual") return s
      return withCompleted(plan, { ...s, painted, mode: "manual" })
    }
  }
}

/**
 * Milliseconds until the next moment the state changes by itself (a word, the end of the paragraph, the hand-over),
 * or null when nothing will: the caller sleeps that long and ticks. Zero means "tick now".
 */
export function nextDueMs(plan: ReaderPlan, s: ReaderState): number | null {
  if (plan.paragraphs.length === 0 || s.mode === "manual") return null
  if (s.lastNow === null) return 0
  const p = plan.paragraphs[s.activeIndex]!
  const k = s.painted[s.activeIndex]!
  let at: number
  if (k < p.wordStarts.length) at = p.wordStarts[k]!
  else if (s.clock < p.endMs) at = p.endMs
  else at = p.endMs + plan.settleMs
  return Math.max(0, at - s.clock)
}
