import { describe, expect, it } from "vitest"
import { orbTagSide, TAG_WIDTH_PX } from "./orb-tag"

describe("orbTagSide", () => {
  it("sits to the right of the orb while there is room", () => {
    expect(orbTagSide(60, 1024)).toBe("right")
  })

  it("flips to the left when the label would cross the right edge", () => {
    expect(orbTagSide(1000, 1024)).toBe("left")
  })

  it("flips left on a phone as soon as the orb is past the label's room", () => {
    expect(orbTagSide(200, 390)).toBe("left")
    expect(orbTagSide(50, 390)).toBe("right")
  })

  it("picks the roomier side when neither fits", () => {
    expect(orbTagSide(120, 300)).toBe("right")
    expect(orbTagSide(180, 300)).toBe("left")
  })

  it("budgets a label wide enough for the copy", () => {
    expect(TAG_WIDTH_PX).toBeGreaterThanOrEqual("Agregar recuerdo".length * 10)
  })
})
