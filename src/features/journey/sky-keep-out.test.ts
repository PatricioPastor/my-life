import { describe, expect, it } from "vitest"
import { FACETS } from "@/features/facets"
import { skyKeepOut } from "./sky-keep-out"

const planet = { x: 0.87, y: 0.2, radius: 0.07 }

describe("skyKeepOut", () => {
  it("holds one box per facet star, the name mark and the controls", () => {
    expect(skyKeepOut(1440, 900)).toHaveLength(FACETS.length + 2)
  })

  it("covers the top-left name mark and the bottom-left controls", () => {
    const boxes = skyKeepOut(1440, 900)
    const covers = (x: number, y: number) =>
      boxes.some((b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom)
    // "patriciopastor" sits at top-10 left-12; "Ver intro" at bottom-7 left-9.
    expect(covers(60, 46)).toBe(true)
    expect(covers(120, 900 - 40)).toBe(true)
  })

  it("adds the planet where the sky draws it, flipping y to screen space", () => {
    const boxes = skyKeepOut(1440, 900, planet)
    expect(boxes).toHaveLength(FACETS.length + 3)
    const box = boxes.at(-1)!
    expect((box.left + box.right) / 2).toBeCloseTo(0.87 * 1440)
    expect((box.top + box.bottom) / 2).toBeCloseTo(0.8 * 900)
    expect(box.right - box.left).toBeCloseTo(2 * 0.07 * 900)
  })
})
