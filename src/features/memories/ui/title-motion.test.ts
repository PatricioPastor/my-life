import { describe, expect, it } from "vitest"
import {
  TITLE_EASE,
  TITLE_FADE_IN_MS,
  TITLE_FADE_OUT_MS,
  TITLE_HOLD_MS,
  TITLE_SHRINK_MS,
  TITLE_START,
  flipTransform,
  reduceTitle,
  titleHidden,
} from "./title-motion"

describe("the title's timing", () => {
  it("holds large for about two seconds, then shrinks in about 600 ms on the interface's ease-out", () => {
    expect(TITLE_HOLD_MS).toBeGreaterThanOrEqual(1800)
    expect(TITLE_HOLD_MS).toBeLessThanOrEqual(2600)
    expect(TITLE_SHRINK_MS).toBe(600)
    expect(TITLE_EASE).toBe("cubic-bezier(0.23, 1, 0.32, 1)")
  })

  it("crossfades quickly under reduced motion: out faster than in", () => {
    expect(TITLE_FADE_OUT_MS).toBeLessThan(TITLE_FADE_IN_MS)
    expect(TITLE_FADE_IN_MS).toBeLessThanOrEqual(260)
  })
})

describe("the title's states", () => {
  it("arrives as the large title", () => {
    expect(TITLE_START).toEqual({ mode: "hero", fading: false })
  })

  it("becomes the small label once the hold is over", () => {
    expect(reduceTitle(TITLE_START, { type: "held", reduced: false })).toEqual({ mode: "label", fading: false })
  })

  it("under reduced motion fades out first, then comes back as the label", () => {
    const out = reduceTitle(TITLE_START, { type: "held", reduced: true })
    expect(out).toEqual({ mode: "hero", fading: true })
    expect(reduceTitle(out, { type: "faded" })).toEqual({ mode: "label", fading: false })
  })

  it("becomes the label for good as soon as an approach starts, before the hold is over", () => {
    const label = reduceTitle(TITLE_START, { type: "approached" })
    expect(label).toEqual({ mode: "label", fading: false })
    expect(reduceTitle(label, { type: "held", reduced: false })).toBe(label)
  })

  it("ignores events that change nothing", () => {
    const label = { mode: "label" as const, fading: false }
    expect(reduceTitle(label, { type: "faded" })).toBe(label)
    expect(reduceTitle(label, { type: "approached" })).toBe(label)
  })
})

describe("when the title is hidden", () => {
  it("hides while the camera flies to a memory, the glass is open or it moves to another", () => {
    expect(titleHidden("flying")).toBe(true)
    expect(titleHidden("open")).toBe(true)
    expect(titleHidden("switching")).toBe(true)
  })

  it("comes back as the camera flies home, and on the overview", () => {
    expect(titleHidden("leaving")).toBe(false)
    expect(titleHidden("idle")).toBe(false)
  })
})

describe("the FLIP from the large title to the label", () => {
  it("puts the label where the title was, at its size, from the top left corner", () => {
    const first = { left: 80, top: 740, width: 425, height: 88 }
    const last = { left: 48, top: 68, width: 85, height: 24 }
    const t = flipTransform(first, last)!
    expect(t.dx).toBe(32)
    expect(t.dy).toBe(672)
    expect(t.scale).toBeCloseTo(5, 6)
  })

  it("is nothing when there is nothing measured (an element not laid out)", () => {
    expect(flipTransform({ left: 0, top: 0, width: 0, height: 0 }, { left: 0, top: 0, width: 0, height: 0 })).toBeNull()
  })
})
