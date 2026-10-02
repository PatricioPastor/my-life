import { describe, expect, it } from "vitest"
import { SPAWN_DISTANCE, driftFor, layoutPoints, spawnNear, startPositions, type LayoutArea } from "./point-layout"

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

describe("spawnNear", () => {
  const field = { width: 1440, height: 900, margin: 48 }

  it("puts a new orb next to its parent, at the spawn distance", () => {
    const at = spawnNear("child", { x: 700, y: 400 }, field)
    expect(Math.hypot(at.x - 700, at.y - 400)).toBeCloseTo(SPAWN_DISTANCE, 5)
  })

  it("is deterministic, and different ids spread around the parent", () => {
    expect(spawnNear("child", { x: 700, y: 400 }, field)).toEqual(spawnNear("child", { x: 700, y: 400 }, field))
    const angles = new Set(["a", "b", "c", "d", "e"].map((id) => spawnNear(id, { x: 700, y: 400 }, field).x.toFixed(1)))
    expect(angles.size).toBeGreaterThan(1)
  })

  it("stays inside the margins when the parent is at the edge", () => {
    for (const parent of [{ x: 48, y: 48 }, { x: 1392, y: 852 }, { x: 48, y: 852 }]) {
      for (const id of ["a", "b", "c", "d", "e", "f"]) {
        const at = spawnNear(id, parent, field)
        expect(at.x).toBeGreaterThanOrEqual(field.margin)
        expect(at.x).toBeLessThanOrEqual(field.width - field.margin)
        expect(at.y).toBeGreaterThanOrEqual(field.margin)
        expect(at.y).toBeLessThanOrEqual(field.height - field.margin)
      }
    }
  })
})

describe("startPositions", () => {
  const field = { width: 1440, height: 900, margin: 48 }
  const names = ["a", "b", "c"]
  const laid = [
    { id: "a", x: 100, y: 100 },
    { id: "b", x: 900, y: 700 },
    { id: "c", x: 500, y: 300 },
  ]

  it("starts every orb where the layout put it when nothing is related or carried", () => {
    const { x, y } = startPositions(names, [null, null, null], laid, null, field)
    expect(x).toEqual([100, 900, 500])
    expect(y).toEqual([100, 700, 300])
  })

  it("keeps the position an orb already had", () => {
    const kept = new Map([["a", { x: 321, y: 123 }]])
    const { x, y } = startPositions(names, [null, null, null], laid, kept, field)
    expect([x[0], y[0]]).toEqual([321, 123])
  })

  it("spawns a new related orb next to its parent, not at a random spot", () => {
    const { x, y } = startPositions(names, [null, null, "a"], laid, null, field)
    expect(Math.hypot(x[2] - 100, y[2] - 100)).toBeLessThan(SPAWN_DISTANCE + 40)
    expect([x[0], y[0]]).toEqual([100, 100])
  })

  it("follows the parent to where it was carried, so a new memory lands beside it", () => {
    const kept = new Map([
      ["a", { x: 640, y: 480 }],
      ["b", { x: 900, y: 700 }],
    ])
    const { x, y } = startPositions(names, [null, null, "a"], laid, kept, field)
    expect(Math.hypot(x[2] - 640, y[2] - 480)).toBeLessThan(SPAWN_DISTANCE + 40)
  })

  it("does not move an orb that is already placed, even though it is related", () => {
    const kept = new Map([
      ["a", { x: 640, y: 480 }],
      ["c", { x: 1000, y: 200 }],
    ])
    const { x, y } = startPositions(names, [null, null, "a"], laid, kept, field)
    expect([x[2], y[2]]).toEqual([1000, 200])
  })

  it("falls back to the layout for a relation to a memory that is not in the list", () => {
    const { x, y } = startPositions(names, [null, null, "ghost"], laid, null, field)
    expect([x[2], y[2]]).toEqual([500, 300])
  })

  describe("a chain of new related orbs (A <- B <- C, all spawned in one pass)", () => {
    const near = (x: number[], y: number[], a: number, b: number) => Math.hypot(x[a] - x[b], y[a] - y[b])

    it("lands each one by the position its parent was just given, not by the parent's layout spot", () => {
      const { x, y } = startPositions(names, [null, "a", "b"], laid, null, field)
      expect(near(x, y, 1, 0)).toBeLessThan(SPAWN_DISTANCE + 1)
      expect(near(x, y, 2, 1)).toBeLessThan(SPAWN_DISTANCE + 1)
      // b's own layout spot is far away: c must not be beside it.
      expect(Math.hypot(x[2] - laid[1].x, y[2] - laid[1].y)).toBeGreaterThan(200)
    })

    it("does not depend on the order: a child listed before its parent still follows it", () => {
      const reversed = ["c", "b", "a"]
      const spots = [laid[2], laid[1], laid[0]]
      const { x, y } = startPositions(reversed, ["b", "a", null], spots, null, field)
      expect(near(x, y, 0, 1)).toBeLessThan(SPAWN_DISTANCE + 1)
      expect(near(x, y, 1, 2)).toBeLessThan(SPAWN_DISTANCE + 1)
      expect([x[2], y[2]]).toEqual([100, 100])
    })

    it("follows a parent that was carried over, and survives a cycle", () => {
      const kept = new Map([["a", { x: 640, y: 480 }]])
      const chained = startPositions(names, [null, "a", "b"], laid, kept, field)
      expect(Math.hypot(chained.x[2] - chained.x[1], chained.y[2] - chained.y[1])).toBeLessThan(SPAWN_DISTANCE + 1)
      const cycle = startPositions(["a", "b"], ["b", "a"], laid.slice(0, 2), null, field)
      expect(cycle.x).toHaveLength(2)
      expect(cycle.x.concat(cycle.y).every(Number.isFinite)).toBe(true)
    })
  })
})
