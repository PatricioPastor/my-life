import { describe, expect, it } from "vitest"
import { swipeStep } from "./swipe"

describe("swipeStep", () => {
  it("goes to the next memory on a swipe to the left", () => {
    expect(swipeStep(-80, 5)).toBe(1)
  })

  it("goes to the previous memory on a swipe to the right", () => {
    expect(swipeStep(80, -10)).toBe(-1)
  })

  it("ignores a short drag or a tap", () => {
    expect(swipeStep(30, 0)).toBe(0)
    expect(swipeStep(0, 0)).toBe(0)
  })

  it("ignores a mostly vertical drag, which is a scroll or a dismiss, not a page turn", () => {
    expect(swipeStep(70, 90)).toBe(0)
  })
})
