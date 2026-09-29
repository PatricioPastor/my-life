import { describe, expect, it } from "vitest"
import { layoutSkySparkles, mulberry32, pushSparkle, type Sparkle } from "./sparkles"

const ANCHORS = [
  { x: 0.21, y: 0.68 },
  { x: 0.57, y: 0.79 },
  { x: 0.75, y: 0.45 },
  { x: 0.39, y: 0.29 },
]

const spark = (user: boolean, x = 0.5): Sparkle => ({
  x,
  y: 0.5,
  reach: 0.05,
  core: 0.01,
  tint: 0,
  phase: 0,
  born: 0,
  user,
})

describe("mulberry32", () => {
  it("is deterministic per seed", () => {
    const a = mulberry32(11)
    const b = mulberry32(11)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it("differs across seeds and stays in [0, 1)", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
    const r = mulberry32(99)
    for (let i = 0; i < 500; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe("layoutSkySparkles", () => {
  it("hangs one bright sparkle per anchor, then 6 small ones", () => {
    const out = layoutSkySparkles(11, ANCHORS)
    expect(out).toHaveLength(ANCHORS.length + 6)
    out.slice(0, ANCHORS.length).forEach((s, i) => {
      expect([s.x, s.y]).toEqual([ANCHORS[i].x, ANCHORS[i].y])
      expect(s.reach).toBeGreaterThanOrEqual(0.085)
      expect(s.reach).toBeLessThanOrEqual(0.11)
      expect(s.core).toBe(0.012)
      expect(s.tint).toBe(i % 2)
      expect(s.user).toBe(false)
      expect(s.born).toBe(-10)
    })
  })

  it("keeps the small ones clear of anchors, the planet and the corner", () => {
    const keepClear = [
      { x: 0.87, y: 0.2 },
      { x: 0.08, y: 0.95 },
    ]
    for (const seed of [11, 4, 23, 5, 31]) {
      const out = layoutSkySparkles(seed, ANCHORS)
      for (const s of out.slice(ANCHORS.length)) {
        for (const c of [...ANCHORS, ...keepClear]) {
          expect(Math.hypot(s.x - c.x, s.y - c.y)).toBeGreaterThan(0.15)
        }
        expect(s.x).toBeGreaterThanOrEqual(0.06)
        expect(s.x).toBeLessThanOrEqual(0.94)
        expect(s.reach).toBeLessThan(0.06)
      }
    }
  })

  it("is deterministic for a seed and varies with it", () => {
    expect(layoutSkySparkles(11, ANCHORS)).toEqual(layoutSkySparkles(11, ANCHORS))
    expect(layoutSkySparkles(11, ANCHORS)).not.toEqual(layoutSkySparkles(12, ANCHORS))
  })

  it("works without anchors", () => {
    expect(layoutSkySparkles(3, [])).toHaveLength(6)
  })
})

describe("pushSparkle", () => {
  it("appends while there is room, without mutating the list", () => {
    const list = [spark(false)]
    const next = spark(true)
    const out = pushSparkle(list, next, 3)
    expect(out).toEqual([list[0], next])
    expect(list).toHaveLength(1)
  })

  it("evicts the oldest user sparkle when full", () => {
    const a = spark(false, 0.1)
    const u1 = spark(true, 0.2)
    const u2 = spark(true, 0.3)
    const next = spark(true, 0.4)
    expect(pushSparkle([a, u1, u2], next, 3)).toEqual([a, u2, next])
  })

  it("never evicts a seeded sparkle: a sky full of them ignores the click", () => {
    const list = [spark(false), spark(false), spark(false)]
    expect(pushSparkle(list, spark(true), 3)).toBe(list)
  })
})
