import { describe, expect, it } from "vitest"
import { memoriesKeepOut, titleFontSize } from "./keep-out"

const covers = (boxes: ReturnType<typeof memoriesKeepOut>, x: number, y: number) =>
  boxes.some((b) => x > b.left && x < b.right && y > b.top && y < b.bottom)

describe("titleFontSize", () => {
  it("follows the --type-display token: 40px on a small phone, 107px at the top", () => {
    expect(titleFontSize(360)).toBe(40)
    expect(titleFontSize(100)).toBe(40)
    expect(titleFontSize(5000)).toBe(107)
    expect(titleFontSize(1440)).toBeCloseTo(40 + (1440 - 360) * 0.054, 5)
  })
})

describe("memoriesKeepOut", () => {
  it("covers the title, the back control and the add slot on desktop", () => {
    const boxes = memoriesKeepOut(1440, 900)
    expect(covers(boxes, 200, 800)).toBe(true) // title, bottom left
    expect(covers(boxes, 80, 50)).toBe(true) // back control, top left
    expect(covers(boxes, 1380, 830)).toBe(true) // add slot, bottom right
    expect(covers(boxes, 720, 450)).toBe(false) // the open middle
  })

  it("scales the title with the viewport on a phone", () => {
    const boxes = memoriesKeepOut(390, 844)
    expect(covers(boxes, 60, 800)).toBe(true)
    expect(covers(boxes, 195, 400)).toBe(false)
    const title = boxes.find((b) => b.bottom === 844 - 72)
    expect(title && title.right).toBeLessThan(390)
  })
})
