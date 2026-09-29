import { describe, expect, it } from "vitest"
import { driftPos } from "./drift"

describe("driftPos", () => {
  it("stays inside the 0.05..0.95 box for any time", () => {
    for (let t = -500; t < 5000; t += 3.7) {
      const [x, y] = driftPos(t)
      expect(x).toBeGreaterThanOrEqual(0.05)
      expect(x).toBeLessThanOrEqual(0.95)
      expect(y).toBeGreaterThanOrEqual(0.05)
      expect(y).toBeLessThanOrEqual(0.95)
    }
  })

  it("is deterministic and matches the canvas formula at t = 0", () => {
    expect(driftPos(12.5)).toEqual(driftPos(12.5))
    const [x, y] = driftPos(0)
    expect(x).toBeCloseTo(0.5 + 0.1 * Math.sin(1.3))
    expect(y).toBeCloseTo(0.5 + 0.26 + 0.12 * Math.cos(4.2))
  })

  it("actually moves", () => {
    expect(driftPos(0)).not.toEqual(driftPos(10))
  })
})
