import { describe, expect, it } from "vitest"
import {
  canContinue,
  initReader,
  MAX_TICK_MS,
  nextDueMs,
  readerProgress,
  readerStep,
  type ReaderEvent,
  type ReaderPlan,
  type ReaderState,
} from "./reader-machine"

// Two paragraphs: 3 words over 500 ms, then 2 words over 300 ms. 600 ms of settle between them.
const PLAN: ReaderPlan = {
  paragraphs: [
    { wordStarts: [0, 100, 200], endMs: 500 },
    { wordStarts: [0, 100], endMs: 300 },
  ],
  settleMs: 600,
}
const THREE: ReaderPlan = {
  paragraphs: [
    { wordStarts: [0, 100], endMs: 300 },
    { wordStarts: [0, 100], endMs: 300 },
    { wordStarts: [0, 100], endMs: 300 },
  ],
  settleMs: 600,
}

const run = (plan: ReaderPlan, events: ReaderEvent[], from: ReaderState = initReader(plan)) =>
  events.reduce((s, e) => readerStep(plan, s, e), from)
const tick = (now: number): ReaderEvent => ({ type: "tick", now })

describe("reader machine", () => {
  it("starts on the first paragraph with nothing painted", () => {
    const s = initReader(PLAN)
    expect(s.activeIndex).toBe(0)
    expect(s.painted).toEqual([0, 0])
    expect(s.mode).toBe("auto")
    expect(s.completed).toBe(false)
    expect(readerProgress(PLAN, s)).toBe(0)
    expect(canContinue(PLAN, s)).toBe(false)
  })

  it("starts the clock on the first tick and paints the words that are due", () => {
    const s = run(PLAN, [tick(1000)])
    expect(s.painted[0]).toBe(1)
    expect(run(PLAN, [tick(1000), tick(1150)]).painted[0]).toBe(2)
    expect(run(PLAN, [tick(1000), tick(1150), tick(1260)]).painted[0]).toBe(3)
  })

  it("reports overall progress as the painted word share, an integer from 0 to 100", () => {
    const s = run(PLAN, [tick(0), tick(150)])
    expect(readerProgress(PLAN, s)).toBe(40) // 2 of 5
    expect(Number.isInteger(readerProgress(PLAN, run(PLAN, [tick(0), tick(250)])))).toBe(true)
  })

  it("never rounds up to 100 before every word is painted", () => {
    const plan: ReaderPlan = { paragraphs: [{ wordStarts: Array.from({ length: 300 }, (_, i) => i), endMs: 400 }], settleMs: 600 }
    const s = run(plan, [tick(0), tick(298)])
    expect(s.painted[0]).toBe(299)
    expect(readerProgress(plan, s)).toBe(99)
  })

  it("waits out the settle, then springs to the next paragraph by itself", () => {
    let s = run(PLAN, [tick(0), tick(500)])
    expect(s.activeIndex).toBe(0)
    expect(s.painted[0]).toBe(3)
    s = run(PLAN, [tick(1000)], s)
    expect(s.activeIndex).toBe(0)
    s = run(PLAN, [tick(1100)], s)
    expect(s.activeIndex).toBe(1)
    expect(s.painted[1]).toBe(1)
    expect(s.mode).toBe("auto")
  })

  it("completes the story on the last paragraph without advancing past it", () => {
    let s = run(PLAN, [tick(0), tick(500), tick(1100)])
    expect(s.activeIndex).toBe(1)
    s = run(PLAN, [tick(1200), tick(1400), tick(1500)], s)
    expect(s.painted).toEqual([3, 2])
    expect(readerProgress(PLAN, s)).toBe(100)
    expect(canContinue(PLAN, s)).toBe(true)
    s = run(PLAN, [tick(9000), tick(10000)], s)
    expect(s.activeIndex).toBe(1)
    expect(s.completed).toBe(true)
    expect(s.mode).toBe("manual")
  })

  it("goto completes the paragraph being left, then activates the target", () => {
    const s = run(PLAN, [tick(0), tick(150), { type: "goto", index: 1 }])
    expect(s.painted).toEqual([3, 0])
    expect(s.activeIndex).toBe(1)
    expect(s.mode).toBe("auto")
    expect(readerProgress(PLAN, s)).toBe(60)
  })

  it("restarts the clock for the target, so it paints from its first word", () => {
    let s = run(PLAN, [tick(0), tick(150), { type: "goto", index: 1 }])
    expect(s.painted[1]).toBe(0)
    s = run(PLAN, [tick(5000)], s)
    expect(s.painted[1]).toBe(1)
  })

  it("goto forward completes every paragraph it passes over", () => {
    const s = run(THREE, [tick(0), { type: "goto", index: 2 }])
    expect(s.painted).toEqual([2, 2, 0])
  })

  it("goto backward completes only the paragraph being left", () => {
    let s = run(THREE, [tick(0), { type: "goto", index: 2 }])
    s = run(THREE, [{ type: "goto", index: 0 }], s)
    expect(s.painted).toEqual([2, 2, 2])
    expect(s.activeIndex).toBe(0)
  })

  it("rests on a paragraph that is already read, and does not auto-advance from it", () => {
    let s = run(THREE, [tick(0), { type: "next" }, { type: "prev" }])
    expect(s.activeIndex).toBe(0)
    expect(s.mode).toBe("manual")
    s = run(THREE, [tick(100), tick(5000), tick(9000)], s)
    expect(s.activeIndex).toBe(0)
  })

  it("next and prev move one paragraph and stay in range", () => {
    let s = run(THREE, [{ type: "prev" }])
    expect(s.activeIndex).toBe(0)
    s = run(THREE, [{ type: "next" }, { type: "next" }], s)
    expect(s.activeIndex).toBe(2)
    s = run(THREE, [{ type: "goto", index: 99 }], s)
    expect(s.activeIndex).toBe(2)
    s = run(THREE, [{ type: "goto", index: -4 }], s)
    expect(s.activeIndex).toBe(0)
  })

  it("next on the last paragraph finishes it instead of doing nothing", () => {
    let s = run(PLAN, [tick(0), { type: "next" }, tick(10)])
    expect(s.activeIndex).toBe(1)
    s = run(PLAN, [{ type: "next" }], s)
    expect(s.activeIndex).toBe(1)
    expect(s.painted).toEqual([3, 2])
    expect(canContinue(PLAN, s)).toBe(true)
    expect(s.mode).toBe("manual")
  })

  it("a goto to the same paragraph changes nothing", () => {
    const s = run(PLAN, [tick(0), tick(150)])
    expect(readerStep(PLAN, s, { type: "goto", index: 0 })).toBe(s)
  })

  it("does not jump ahead after a long stall", () => {
    const s = run(PLAN, [tick(0), tick(1_000_000)])
    expect(s.clock).toBe(MAX_TICK_MS)
  })

  it("asks to be woken at the next word, then at the end, then at the advance", () => {
    let s = initReader(PLAN)
    expect(nextDueMs(PLAN, s)).toBe(0)
    s = run(PLAN, [tick(0)])
    expect(nextDueMs(PLAN, s)).toBe(100)
    s = run(PLAN, [tick(250)], s)
    expect(s.painted[0]).toBe(3)
    expect(nextDueMs(PLAN, s)).toBe(250) // endMs 500 - clock 250
    s = run(PLAN, [tick(500)], s)
    expect(nextDueMs(PLAN, s)).toBe(600)
  })

  it("has nothing to wake for once the story is complete", () => {
    const s = run(PLAN, [{ type: "next" }, { type: "next" }])
    expect(nextDueMs(PLAN, s)).toBeNull()
  })

  it("handles a story with nothing to read as already complete", () => {
    const empty: ReaderPlan = { paragraphs: [], settleMs: 600 }
    const s = initReader(empty)
    expect(readerProgress(empty, s)).toBe(100)
    expect(canContinue(empty, s)).toBe(true)
    expect(nextDueMs(empty, s)).toBeNull()
    expect(readerStep(empty, s, { type: "next" })).toBe(s)
  })
})

describe("reader machine: panning inside a tall paragraph", () => {
  // 2.3 reading areas tall: two pan steps (see panSteps).
  const TALL = [2.3, 1]
  const measured = (events: ReaderEvent[] = []) => run(PLAN, [{ type: "measure", ratios: TALL }, ...events])

  it("takes the pan steps from the measured ratios", () => {
    const s = measured()
    expect(s.pan).toBe(0)
    expect(readerStep(PLAN, s, { type: "measure", ratios: TALL })).toBe(s)
  })

  it("pans before it advances: next moves inside the paragraph first", () => {
    let s = measured([tick(0), { type: "next" }])
    expect(s.activeIndex).toBe(0)
    expect(s.pan).toBe(1)
    expect(s.painted[0]).toBe(1) // not completed: the visitor is still reading it
    s = run(PLAN, [{ type: "next" }], s)
    expect(s.activeIndex).toBe(0)
    expect(s.pan).toBe(2)
  })

  it("advances only once the end is visible, completing the paragraph then", () => {
    const s = measured([{ type: "next" }, { type: "next" }, { type: "next" }])
    expect(s.activeIndex).toBe(1)
    expect(s.pan).toBe(0)
    expect(s.painted[0]).toBe(3)
  })

  it("prev pans back up first, then goes to the paragraph before, landing on its end", () => {
    let s = measured([{ type: "next" }, { type: "next" }, { type: "next" }]) // now on paragraph 1
    s = run(PLAN, [{ type: "prev" }], s)
    expect(s.activeIndex).toBe(0)
    expect(s.pan).toBe(2)
    s = run(PLAN, [{ type: "prev" }, { type: "prev" }], s)
    expect(s.activeIndex).toBe(0)
    expect(s.pan).toBe(0)
    s = run(PLAN, [{ type: "prev" }], s)
    expect(s.activeIndex).toBe(0)
  })

  it("on the last paragraph, pans to the end before it finishes the story", () => {
    let s = run(PLAN, [{ type: "measure", ratios: [1, 1.5] }, { type: "next" }]) // on paragraph 1 (one step)
    s = run(PLAN, [{ type: "next" }], s)
    expect(s.pan).toBe(1)
    expect(canContinue(PLAN, s)).toBe(false)
    s = run(PLAN, [{ type: "next" }], s)
    expect(canContinue(PLAN, s)).toBe(true)
  })

  it("follows the painting down the paragraph without forcing the visitor back afterwards", () => {
    const plan: ReaderPlan = { paragraphs: [{ wordStarts: Array.from({ length: 10 }, (_, i) => i * 100), endMs: 1200 }], settleMs: 600 }
    let s = run(plan, [{ type: "measure", ratios: [3] }, tick(0)])
    expect(s.pan).toBe(0)
    s = run(plan, [tick(1000)], s)
    expect(s.pan).toBe(4)
    s = run(plan, [{ type: "prev" }, tick(1100)], s)
    expect(s.pan).toBe(3) // the visitor scrolled up to reread: a later tick does not drag them down again
  })

  it("clamps the pan when the paragraph gets shorter", () => {
    const s = measured([{ type: "next" }, { type: "next" }])
    expect(readerStep(PLAN, s, { type: "measure", ratios: [1, 1] }).pan).toBe(0)
  })

  it("has nothing to pan on a paragraph that fits", () => {
    const s = run(PLAN, [tick(0), { type: "next" }])
    expect(s.activeIndex).toBe(1)
    expect(s.pan).toBe(0)
  })
})
