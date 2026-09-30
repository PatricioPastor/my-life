import { describe, expect, it } from "vitest"
import { createWheelGate, normalizeWheelDelta } from "./wheel-gate"

const OPTS = { threshold: 40, cooldownMs: 600, quietMs: 140, accumulateMs: 250, maxLockMs: 1500 }

describe("wheel gate", () => {
  it("adds small deltas up to the threshold, then steps once", () => {
    const g = createWheelGate(OPTS)
    expect(g.feed(20, 0)).toBe(0)
    expect(g.feed(25, 16)).toBe(1)
  })

  it("steps back for a negative delta", () => {
    const g = createWheelGate(OPTS)
    expect(g.feed(-60, 0)).toBe(-1)
  })

  it("drops what it had added when the direction flips", () => {
    const g = createWheelGate(OPTS)
    expect(g.feed(30, 0)).toBe(0)
    expect(g.feed(-30, 16)).toBe(0)
    expect(g.feed(-30, 32)).toBe(-1)
  })

  it("forgets a stale trickle", () => {
    const g = createWheelGate(OPTS)
    expect(g.feed(30, 0)).toBe(0)
    expect(g.feed(30, 1000)).toBe(0)
  })

  it("ignores everything during the cooldown", () => {
    const g = createWheelGate(OPTS)
    expect(g.feed(100, 0)).toBe(1)
    expect(g.feed(100, 100)).toBe(0)
    expect(g.feed(100, 590)).toBe(0)
  })

  it("keeps ignoring a trackpad fling that is still coming after the cooldown", () => {
    const g = createWheelGate(OPTS)
    expect(g.feed(200, 0)).toBe(1)
    for (let t = 16; t <= 1200; t += 16) expect(g.feed(80, t)).toBe(0)
  })

  it("accepts a fresh gesture once the cooldown passed and the stream paused", () => {
    const g = createWheelGate(OPTS)
    expect(g.feed(100, 0)).toBe(1)
    expect(g.feed(10, 300)).toBe(0)
    expect(g.feed(100, 800)).toBe(1)
  })

  it("never stays locked longer than the hard cap, even in an endless stream", () => {
    const g = createWheelGate(OPTS)
    expect(g.feed(100, 0)).toBe(1)
    let fired = 0
    for (let t = 16; t <= 1700; t += 16) fired += g.feed(100, t)
    expect(fired).toBeGreaterThan(0)
  })

  it("steps again for each notch of a mouse wheel that is spaced out", () => {
    const g = createWheelGate(OPTS)
    expect(g.feed(100, 0)).toBe(1)
    expect(g.feed(100, 800)).toBe(1)
    expect(g.feed(100, 1600)).toBe(1)
  })
})

describe("normalizeWheelDelta", () => {
  it("scales lines and pages to pixels", () => {
    expect(normalizeWheelDelta(3, 1, 800)).toBe(48)
    expect(normalizeWheelDelta(1, 2, 800)).toBe(800)
    expect(normalizeWheelDelta(120, 0, 800)).toBe(120)
  })
})
