import { describe, expect, it } from "vitest"
import { nearestOrb, TAP_RADIUS } from "./tap-target"

const orbs = [
  { id: "a", x: 100, y: 100 },
  { id: "b", x: 112, y: 104 },
  { id: "c", x: 300, y: 300 },
]

describe("nearestOrb", () => {
  it("picks the orb whose center is closest to the tap, not the one drawn on top", () => {
    expect(nearestOrb({ x: 101, y: 100 }, orbs)).toBe("a")
    expect(nearestOrb({ x: 111, y: 105 }, orbs)).toBe("b")
  })

  it("is null when no orb is within the tap radius", () => {
    expect(nearestOrb({ x: 200, y: 200 }, orbs)).toBeNull()
    expect(nearestOrb({ x: 100 + TAP_RADIUS + 1, y: 100 }, [orbs[0]])).toBeNull()
  })

  it("is null for no orbs", () => {
    expect(nearestOrb({ x: 0, y: 0 }, [])).toBeNull()
  })
})
