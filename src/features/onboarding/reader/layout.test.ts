import { describe, expect, it } from "vitest"
import { autoPanStep, focusScaleFor, layoutStack, panRatios, panSteps, snapLayout, snapPx, type LayoutParams, type StackBlock } from "./layout"

const P: LayoutParams = { scale: 2, gap: 24, focusGap: 24, line: 300, top: 0, bottom: 1000 }
const reading = (height: number, readable: number): StackBlock => ({ height, readable })
const still = (height: number): StackBlock => ({ height, readable: -1 })

describe("layoutStack", () => {
  it("gives the focus to exactly the active paragraph", () => {
    const { weights } = layoutStack([reading(100, 0), reading(100, 1), reading(100, 2)], 1, P)
    expect(weights).toEqual([0, 1, 0])
  })

  it("shares the focus between two paragraphs while the spring is between them", () => {
    const { weights } = layoutStack([reading(100, 0), reading(100, 1)], 0.25, P)
    expect(weights[0]).toBeCloseTo(0.75)
    expect(weights[1]).toBeCloseTo(0.25)
  })

  it("never focuses a subheading or a break", () => {
    const { weights } = layoutStack([reading(100, 0), still(40), still(1), reading(100, 1)], 0, P)
    expect(weights).toEqual([1, 0, 0, 0])
  })

  it("keeps the focused paragraph at its native size and scales the rest down", () => {
    const { scales } = layoutStack([reading(100, 0), reading(100, 1)], 0, P)
    expect(scales).toEqual([1, 0.5])
  })

  it("stacks tops from the scaled heights, with a wider gap beside the focus", () => {
    const { tops } = layoutStack([reading(100, 0), reading(100, 1)], 0, P)
    expect(tops[0]).toBe(0)
    expect(tops[1]).toBe(100 + 24 + 24)
  })

  it("uses the plain gap between paragraphs that are both out of focus", () => {
    const { tops } = layoutStack([reading(100, 0), reading(100, 1), reading(100, 2)], 0, P)
    expect(tops[2]! - tops[1]!).toBe(50 + 24)
  })

  it("puts the centre of the active paragraph on the reading line", () => {
    const { y, tops, scales } = layoutStack([reading(100, 0)], 0, P)
    expect(tops[0]! + (100 * scales[0]!) / 2 + y).toBe(300)
  })

  it("follows the active paragraph down the stack", () => {
    const blocks = [reading(100, 0), reading(100, 1), reading(100, 2)]
    const { y, tops, scales } = layoutStack(blocks, 2, P)
    expect(tops[2]! + (100 * scales[2]!) / 2 + y).toBe(300)
  })

  it("moves smoothly between two centres while the spring travels", () => {
    const blocks = [reading(100, 0), reading(100, 1)]
    const a = layoutStack(blocks, 0, P).y
    const b = layoutStack(blocks, 1, P).y
    const mid = layoutStack(blocks, 0.5, P).y
    expect(mid).toBeLessThan(a)
    expect(mid).toBeGreaterThan(b)
  })

  it("carries on past the target when the spring overshoots, without negative weights", () => {
    const blocks = [reading(100, 0), reading(100, 1)]
    const at = layoutStack(blocks, 1, P)
    const over = layoutStack(blocks, 1.1, P)
    expect(over.y).toBeLessThan(at.y)
    for (const w of over.weights) expect(w).toBeGreaterThanOrEqual(0)
  })

  it("keeps a tall paragraph below the top bound instead of centring it on the line", () => {
    const { y, tops, scales } = layoutStack([reading(400, 0)], 0, { ...P, scale: 1, line: 100, top: 60 })
    expect(tops[0]! + y).toBe(60)
    expect(scales[0]).toBe(1)
  })

  it("keeps a paragraph above the bottom bound", () => {
    const { y, tops } = layoutStack([reading(200, 0)], 0, { ...P, scale: 1, line: 900, bottom: 700 })
    expect(tops[0]! + 200 + y).toBe(700)
  })

  it("aligns to the top when the paragraph is taller than the room", () => {
    const { y, tops } = layoutStack([reading(2000, 0)], 0, { ...P, scale: 1, top: 40, bottom: 600 })
    expect(tops[0]! + y).toBe(40)
  })

  it("is a plain list when nothing is readable", () => {
    const r = layoutStack([still(40), still(1)], 0, P)
    expect(r.weights).toEqual([0, 0])
    expect(r.y).toBe(0)
  })

  it("does not scale anything with a scale of one, for reduced motion", () => {
    const { scales } = layoutStack([reading(100, 0), reading(100, 1)], 0.5, { ...P, scale: 1 })
    expect(scales).toEqual([1, 1])
  })
})

describe("fit scale", () => {
  const room: LayoutParams = { ...P, top: 0, bottom: 600 }

  it("keeps the native size when the paragraph fits", () => {
    expect(focusScaleFor(100, room)).toBe(1)
    expect(focusScaleFor(600, room)).toBe(1)
  })

  it("shrinks the focused paragraph so a tall one still fits the reading area", () => {
    expect(focusScaleFor(1000, room)).toBeCloseTo(0.6)
    expect(layoutStack([reading(1000, 0)], 0, room).scales[0]).toBeCloseTo(0.6)
  })

  it("never goes below the resting scale, however tall the paragraph", () => {
    expect(focusScaleFor(2000, room)).toBe(0.5)
    expect(layoutStack([reading(2000, 0)], 0, room).scales[0]).toBe(0.5)
  })

  it("treats an unmeasured block as fitting", () => {
    expect(focusScaleFor(0, room)).toBe(1)
  })
})

describe("pan", () => {
  const room: LayoutParams = { ...P, scale: 1, top: 0, bottom: 600, line: 300 }

  it("needs no steps when it fits, and about 65% of the area per step otherwise", () => {
    expect(panSteps(1)).toBe(0)
    expect(panSteps(0.4)).toBe(0)
    expect(panSteps(1.3)).toBe(1)
    expect(panSteps(1.65)).toBe(1)
    expect(panSteps(1.66)).toBe(2)
    expect(panSteps(3)).toBe(4)
  })

  it("measures how many reading areas each readable paragraph takes at its focus scale", () => {
    const blocks = [reading(1500, 0), still(40), reading(100, 1)]
    const [a, b] = panRatios(blocks, { ...room, scale: 2 })
    expect(a).toBeCloseTo(750 / 600)
    expect(b).toBeCloseTo(100 / 600)
  })

  it("slides the focused paragraph up by one step", () => {
    const at0 = layoutStack([reading(1000, 0)], 0, room, [0])
    const at1 = layoutStack([reading(1000, 0)], 0, room, [1])
    expect(at0.tops[0]! + at0.y).toBe(0)
    expect(at1.tops[0]! + at1.y).toBe(-390)
  })

  it("stops at the end of the paragraph, so its last line sits at the bottom of the area", () => {
    const { tops, y } = layoutStack([reading(1000, 0)], 0, room, [2])
    expect(tops[0]! + y).toBe(-400)
  })

  it("follows the painting: later words need later steps, and the end needs the last step", () => {
    const r = 1000 / 600
    expect(autoPanStep(r, 0.1)).toBe(0)
    expect(autoPanStep(r, 1)).toBe(panSteps(r))
    let last = 0
    for (let f = 0; f <= 1; f += 0.05) {
      const k = autoPanStep(r, f)
      expect(k).toBeGreaterThanOrEqual(last)
      last = k
    }
  })
})

describe("pixel snapping", () => {
  it("rounds to whole device pixels", () => {
    expect(snapPx(10.3, 1)).toBe(10)
    expect(snapPx(10.3, 2)).toBe(10.5)
    expect(snapPx(10.2, 2)).toBe(10)
    expect(snapPx(-3.3, 3)).toBeCloseTo(-10 / 3)
  })

  it("falls back to whole CSS pixels for a missing or invalid ratio", () => {
    expect(snapPx(10.6, 0)).toBe(11)
    expect(snapPx(10.6, Number.NaN)).toBe(11)
  })

  it("snaps the stack and every top, and drops scale noise at rest", () => {
    const layout = { weights: [1, 0], scales: [1.0004, 0.64], tops: [0.3, 141.27], y: 125.07 }
    const at = snapLayout(layout, 2)
    expect(at.y).toBe(125)
    expect(at.tops).toEqual([0.5, 141.5])
    expect(at.scales).toEqual([1, 0.64])
    expect(at.weights).toEqual([1, 0])
  })

  it("lands the stack on the pixel grid of the page, not of the stage, when the stage starts between pixels", () => {
    const layout = { weights: [1], scales: [1], tops: [0], y: 125.1 }
    // The stage starts at 284.39: the stack must end on a page position that is a whole device pixel.
    const at = snapLayout(layout, 2, 284.39)
    expect((284.39 + at.y) * 2).toBeCloseTo(Math.round((284.39 + at.y) * 2), 6)
    expect(at.y).toBeCloseTo(125.11, 6)
  })

  it("leaves a real fit scale alone", () => {
    expect(snapLayout({ weights: [1], scales: [0.6], tops: [0], y: 0 }, 2).scales).toEqual([0.6])
  })
})
