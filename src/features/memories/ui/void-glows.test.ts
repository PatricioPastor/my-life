import { describe, expect, it } from "vitest"
import { VOID_GLOWS } from "./void-glows"

describe("VOID_GLOWS", () => {
  it("has two or three very soft glows", () => {
    expect(VOID_GLOWS.length).toBeGreaterThanOrEqual(2)
    expect(VOID_GLOWS.length).toBeLessThanOrEqual(3)
    for (const glow of VOID_GLOWS) {
      expect(glow.alpha).toBeGreaterThan(0)
      expect(glow.alpha).toBeLessThanOrEqual(0.2)
    }
  })

  it("moves on long cycles of 60 to 120 seconds", () => {
    for (const glow of VOID_GLOWS) {
      expect(glow.duration).toBeGreaterThanOrEqual(60)
      expect(glow.duration).toBeLessThanOrEqual(120)
    }
  })

  it("never repeats in step: distinct durations, and phases already mid-cycle", () => {
    const durations = VOID_GLOWS.map((g) => g.duration)
    expect(new Set(durations).size).toBe(durations.length)
    // Coprime-ish whole seconds, so the combined picture takes far longer than any single cycle to come back.
    for (const d of durations) expect(Number.isInteger(d)).toBe(true)
    const delays = VOID_GLOWS.map((g) => g.delay)
    expect(new Set(delays).size).toBe(delays.length)
    for (const delay of delays) expect(delay).toBeLessThan(0)
  })

  it("is violet and indigo, each with a faint tint of an orb color, and sits inside the stage", () => {
    for (const glow of VOID_GLOWS) {
      expect(glow.color).toMatch(/^#[0-9a-f]{6}$/)
      expect(glow.tint).toMatch(/^#[0-9a-f]{6}$/)
      expect(glow.x).toBeGreaterThanOrEqual(0)
      expect(glow.x).toBeLessThanOrEqual(100)
      expect(glow.y).toBeGreaterThanOrEqual(0)
      expect(glow.y).toBeLessThanOrEqual(100)
      expect(glow.size).toBeGreaterThan(40)
    }
  })

  it("sits far behind the orbs: each glow has a small depth, so it moves less than the dust with the camera", () => {
    for (const glow of VOID_GLOWS) {
      expect(glow.depth).toBeGreaterThan(0)
      expect(glow.depth).toBeLessThanOrEqual(0.16)
    }
    expect(new Set(VOID_GLOWS.map((g) => g.depth)).size).toBe(VOID_GLOWS.length)
  })
})
