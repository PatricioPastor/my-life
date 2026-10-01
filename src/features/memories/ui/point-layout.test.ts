import { describe, expect, it } from "vitest"
import { driftFor, layoutPoints, type LayoutArea } from "./point-layout"

const area: LayoutArea = {
  width: 1440,
  height: 900,
  margin: 48,
  spacing: 56,
  keepOut: [
    { left: 0, top: 0, right: 240, bottom: 80 },
    { left: 60, top: 600, right: 900, bottom: 900 },
  ],
}
const ids = (n: number) => Array.from({ length: n }, (_, i) => `memory-${i}`)
const inside = (p: { x: number; y: number }, r: { left: number; top: number; right: number; bottom: number }) =>
  p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom

describe("layoutPoints", () => {
  it("is deterministic", () => {
    expect(layoutPoints(ids(40), area)).toEqual(layoutPoints(ids(40), area))
  })

  it("returns one point per id, in order", () => {
    const points = layoutPoints(ids(10), area)
    expect(points.map((p) => p.id)).toEqual(ids(10))
  })

  it("keeps every point inside the safe margins", () => {
    for (const p of layoutPoints(ids(60), area)) {
      expect(p.x).toBeGreaterThanOrEqual(area.margin)
      expect(p.x).toBeLessThanOrEqual(area.width - area.margin)
      expect(p.y).toBeGreaterThanOrEqual(area.margin)
      expect(p.y).toBeLessThanOrEqual(area.height - area.margin)
    }
  })

  it("keeps clear of every keep-out box", () => {
    for (const p of layoutPoints(ids(60), area)) {
      for (const box of area.keepOut) expect(inside(p, box)).toBe(false)
    }
  })

  it("keeps the minimum spacing while there is room", () => {
    const points = layoutPoints(ids(60), area)
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        expect(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)).toBeGreaterThanOrEqual(area.spacing)
      }
    }
  })

  it("does not move existing points when memories are appended", () => {
    const before = layoutPoints(ids(30), area)
    const after = layoutPoints(ids(31), area)
    expect(after.slice(0, 30)).toEqual(before)
  })

  it("gives different ids different places", () => {
    const [a, b] = layoutPoints(["one", "two"], area)
    expect([a.x, a.y]).not.toEqual([b.x, b.y])
  })

  it("still places every point, inside the bounds, when the space is crowded", () => {
    const points = layoutPoints(ids(400), { ...area, width: 390, height: 844, margin: 32, keepOut: [] })
    expect(points).toHaveLength(400)
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(32)
      expect(p.x).toBeLessThanOrEqual(358)
    }
  })

  it("returns nothing for no memories and survives a degenerate area", () => {
    expect(layoutPoints([], area)).toEqual([])
    const [p] = layoutPoints(["a"], { ...area, width: 40, height: 40 })
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
  })
})

describe("driftFor", () => {
  it("is deterministic per id and differs between ids", () => {
    expect(driftFor("a")).toEqual(driftFor("a"))
    expect(driftFor("a")).not.toEqual(driftFor("b"))
  })

  it("is a gentle, slow wobble", () => {
    for (const id of ids(50)) {
      const d = driftFor(id)
      expect(Math.abs(d.dx)).toBeLessThanOrEqual(10)
      expect(Math.abs(d.dy)).toBeLessThanOrEqual(10)
      expect(d.duration).toBeGreaterThanOrEqual(7)
      expect(d.duration).toBeLessThanOrEqual(16)
      expect(d.delay).toBeLessThanOrEqual(0)
    }
  })
})
