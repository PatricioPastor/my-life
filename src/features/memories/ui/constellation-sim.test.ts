import { describe, expect, it } from "vitest"
import { MAX_SPEED, SETTLE_MAX_STEPS, SIM_DT, createSim, type ConstellationSim } from "./constellation-sim"
import { memoriesKeepOut } from "./keep-out"
import { layoutPoints } from "./point-layout"
import type { Edge } from "./similarity"

const WIDTH = 1280
const HEIGHT = 800
const MARGIN = 56
const KEEP_OUT = memoriesKeepOut(WIDTH, HEIGHT)
const AREA = { width: WIDTH, height: HEIGHT, margin: MARGIN, keepOut: KEEP_OUT }

const ids = (n: number, prefix = "m") => Array.from({ length: n }, (_, i) => `${prefix}${i}`)

function make(names: readonly string[], edges: Edge[] = [], area = AREA): ConstellationSim {
  const placed = layoutPoints(names, { ...area, spacing: 60 })
  return createSim({ ids: names, x: placed.map((p) => p.x), y: placed.map((p) => p.y), edges, area })
}

const run = (sim: ConstellationSim, steps: number) => {
  for (let i = 0; i < steps; i++) sim.step()
}
const dist = (sim: ConstellationSim, i: number, j: number) => Math.hypot(sim.x[i] - sim.x[j], sim.y[i] - sim.y[j])
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length
const speed = (sim: ConstellationSim, i: number) => Math.hypot(sim.vx[i], sim.vy[i])
const inside = (x: number, y: number, b: { left: number; top: number; right: number; bottom: number }) =>
  x > b.left && x < b.right && y > b.top && y < b.bottom

/** Three groups of six; every pair in a group is linked, none across groups. */
function groups() {
  const names = ids(18)
  const edges: Edge[] = []
  for (let g = 0; g < 3; g++)
    for (let i = 0; i < 6; i++)
      for (let j = i + 1; j < 6; j++) edges.push({ a: g * 6 + i, b: g * 6 + j, weight: 0.85 })
  return { names, edges }
}
const group = (i: number) => Math.floor(i / 6)

function meanDistances(sim: ConstellationSim) {
  const within: number[] = []
  const across: number[] = []
  for (let i = 0; i < sim.count; i++)
    for (let j = i + 1; j < sim.count; j++) (group(i) === group(j) ? within : across).push(dist(sim, i, j))
  return { within: mean(within), across: mean(across) }
}

describe("createSim", () => {
  it("starts exactly where it is told, at rest, so nothing jumps on mount", () => {
    const placed = layoutPoints(ids(12), { ...AREA, spacing: 60 })
    const sim = createSim({ ids: ids(12), x: placed.map((p) => p.x), y: placed.map((p) => p.y), edges: [], area: AREA })
    expect(sim.count).toBe(12)
    for (let i = 0; i < 12; i++) {
      expect(sim.x[i]).toBe(placed[i].x)
      expect(sim.y[i]).toBe(placed[i].y)
      expect(speed(sim, i)).toBe(0)
    }
  })

  it("moves only a hair on the first step", () => {
    const sim = make(ids(12))
    const before = Array.from(sim.x)
    sim.step()
    sim.x.forEach((x, i) => expect(Math.abs(x - before[i])).toBeLessThan(0.5))
  })
})

describe("determinism", () => {
  it("makes the same trajectory for the same input, and a different one for other ids", () => {
    const a = make(ids(20))
    const b = make(ids(20))
    run(a, 400)
    run(b, 400)
    expect(Array.from(a.x)).toEqual(Array.from(b.x))
    expect(Array.from(a.y)).toEqual(Array.from(b.y))

    const c = make(ids(20, "other"))
    run(c, 400)
    expect(Array.from(c.x)).not.toEqual(Array.from(a.x))
  })

  it("keeps a node's own wander when other memories are added after it", () => {
    const solo = createSim({ ids: ["a"], x: [640], y: [300], edges: [], area: AREA })
    const crowd = createSim({ ids: ["a", "b"], x: [640, 1000], y: [300, 300], edges: [], area: AREA })
    run(solo, 300)
    run(crowd, 300)
    expect(crowd.x[0]).toBeCloseTo(solo.x[0], 6)
    expect(crowd.y[0]).toBeCloseTo(solo.y[0], 6)
  })
})

describe("stability", () => {
  it("never produces NaN or Infinity and keeps every speed under the cap", () => {
    const { names, edges } = groups()
    const sim = make([...names, ...ids(40, "x")], edges)
    for (let block = 0; block < 30; block++) {
      run(sim, 100)
      for (let i = 0; i < sim.count; i++) {
        expect(Number.isFinite(sim.x[i]) && Number.isFinite(sim.y[i])).toBe(true)
        expect(Number.isFinite(sim.vx[i]) && Number.isFinite(sim.vy[i])).toBe(true)
        expect(speed(sim, i)).toBeLessThanOrEqual(MAX_SPEED + 1e-9)
      }
    }
  })

  it("keeps the kinetic energy bounded even from a pile-up on one point", () => {
    const n = 60
    const sim = createSim({
      ids: ids(n),
      x: new Array(n).fill(640),
      y: new Array(n).fill(300),
      edges: [],
      area: AREA,
    })
    let peak = 0
    for (let s = 0; s < 1500; s++) {
      sim.step()
      let energy = 0
      for (let i = 0; i < n; i++) energy += 0.5 * (sim.vx[i] ** 2 + sim.vy[i] ** 2)
      peak = Math.max(peak, energy)
    }
    expect(peak).toBeLessThanOrEqual(0.5 * n * MAX_SPEED ** 2 + 1e-6)
  })

  it("still breathes once it has settled: the orbs never freeze", () => {
    const { names, edges } = groups()
    const sim = make(names, edges)
    run(sim, 1800)
    const speeds: number[] = []
    for (let s = 0; s < 120; s++) {
      sim.step()
      speeds.push(mean(Array.from({ length: sim.count }, (_, i) => speed(sim, i))))
    }
    expect(mean(speeds)).toBeGreaterThan(0.5)
    expect(mean(speeds)).toBeLessThan(MAX_SPEED / 2)
  })

  it("advances its own clock by the fixed timestep", () => {
    const sim = make(ids(3))
    run(sim, 60)
    expect(sim.time).toBeCloseTo(60 * SIM_DT, 9)
  })
})

describe("bounds and keep-outs", () => {
  it("keeps every orb inside the margins and out of every keep-out box, for the whole run", () => {
    const { names, edges } = groups()
    const sim = make([...names, ...ids(30, "x")], edges)
    for (let block = 0; block < 40; block++) {
      run(sim, 100)
      for (let i = 0; i < sim.count; i++) {
        expect(sim.x[i]).toBeGreaterThanOrEqual(MARGIN)
        expect(sim.x[i]).toBeLessThanOrEqual(WIDTH - MARGIN)
        expect(sim.y[i]).toBeGreaterThanOrEqual(MARGIN)
        expect(sim.y[i]).toBeLessThanOrEqual(HEIGHT - MARGIN)
        for (const box of KEEP_OUT) expect(inside(sim.x[i], sim.y[i], box)).toBe(false)
      }
    }
  })

  it("pushes an orb that is thrown into the title back out", () => {
    const title = KEEP_OUT[0]
    const sim = createSim({
      ids: ["a"],
      x: [(title.left + title.right) / 2],
      y: [(title.top + title.bottom) / 2],
      edges: [],
      area: AREA,
    })
    run(sim, 5)
    for (const box of KEEP_OUT) expect(inside(sim.x[0], sim.y[0], box)).toBe(false)
  })

  it("holds on a phone-sized stage too", () => {
    const area = { width: 390, height: 844, margin: 36, keepOut: memoriesKeepOut(390, 844) }
    const sim = make(ids(30), [], area)
    run(sim, 1200)
    for (let i = 0; i < sim.count; i++) {
      expect(sim.x[i]).toBeGreaterThanOrEqual(36)
      expect(sim.x[i]).toBeLessThanOrEqual(390 - 36)
      expect(sim.y[i]).toBeGreaterThanOrEqual(36)
      expect(sim.y[i]).toBeLessThanOrEqual(844 - 36)
      for (const box of area.keepOut) expect(inside(sim.x[i], sim.y[i], box)).toBe(false)
    }
  })
})

describe("forces", () => {
  it("pulls related memories together: they end closer than unrelated ones, and closer than they began", () => {
    const { names, edges } = groups()
    const sim = make(names, edges)
    const start = meanDistances(sim)
    run(sim, 1800)
    const end = meanDistances(sim)
    expect(end.within).toBeLessThan(end.across)
    expect(end.within).toBeLessThan(start.within * 0.7)
  })

  it("makes a stronger tie sit closer than a weaker one", () => {
    const sim = createSim({
      ids: ["a", "b", "c", "d"],
      x: [300, 900, 300, 900],
      y: [300, 300, 600, 600],
      edges: [
        { a: 0, b: 1, weight: 1 },
        { a: 2, b: 3, weight: 0.36 },
      ],
      area: AREA,
    })
    sim.settle()
    expect(dist(sim, 0, 1)).toBeLessThan(dist(sim, 2, 3))
  })

  it("separates two orbs that start on top of each other", () => {
    const sim = createSim({ ids: ["a", "b"], x: [640, 640], y: [300, 300], edges: [], area: AREA })
    run(sim, 240)
    expect(dist(sim, 0, 1)).toBeGreaterThan(40)
  })

  it("keeps related orbs from overlapping each other as they gather", () => {
    const { names, edges } = groups()
    const sim = make(names, edges)
    run(sim, 1800)
    let nearest = Infinity
    for (let i = 0; i < sim.count; i++) for (let j = i + 1; j < sim.count; j++) nearest = Math.min(nearest, dist(sim, i, j))
    expect(nearest).toBeGreaterThan(30)
  })
})

describe("pinning", () => {
  it("never moves a pinned orb, wherever the others go, and lets it drift again once released", () => {
    const { names, edges } = groups()
    const sim = make(names, edges)
    run(sim, 200)
    const px = sim.x[3]
    const py = sim.y[3]
    const others = Array.from(sim.x)
    sim.pinned[3] = 1
    run(sim, 300)
    expect(sim.x[3]).toBe(px)
    expect(sim.y[3]).toBe(py)
    expect(speed(sim, 3)).toBe(0)
    expect(sim.x.some((x, i) => i !== 3 && x !== others[i])).toBe(true)
    sim.pinned[3] = 0
    run(sim, 300)
    expect(Math.hypot(sim.x[3] - px, sim.y[3] - py)).toBeGreaterThan(0)
  })

  it("still lets a pinned orb push its neighbours away", () => {
    const sim = createSim({ ids: ["a", "b"], x: [640, 650], y: [300, 300], edges: [], area: AREA })
    sim.pinned[0] = 1
    run(sim, 240)
    expect(sim.x[0]).toBe(640)
    expect(dist(sim, 0, 1)).toBeGreaterThan(40)
  })
})

describe("settle (reduced motion)", () => {
  it("runs a bounded number of steps to near-equilibrium and gathers the clusters", () => {
    const { names, edges } = groups()
    const sim = make(names, edges)
    const steps = sim.settle()
    expect(steps).toBeGreaterThan(0)
    expect(steps).toBeLessThanOrEqual(SETTLE_MAX_STEPS)
    let fastest = 0
    for (let i = 0; i < sim.count; i++) fastest = Math.max(fastest, speed(sim, i))
    expect(fastest).toBeLessThan(1)
    const end = meanDistances(sim)
    expect(end.within).toBeLessThan(end.across)
    for (let i = 0; i < sim.count; i++) {
      expect(Number.isFinite(sim.x[i]) && Number.isFinite(sim.y[i])).toBe(true)
      for (const box of KEEP_OUT) expect(inside(sim.x[i], sim.y[i], box)).toBe(false)
    }
  })

  it("is deterministic and leaves the sim ready to run normally afterwards", () => {
    const { names, edges } = groups()
    const a = make(names, edges)
    const b = make(names, edges)
    a.settle()
    b.settle()
    expect(Array.from(a.x)).toEqual(Array.from(b.x))
    run(a, 120)
    for (let i = 0; i < a.count; i++) expect(speed(a, i)).toBeLessThanOrEqual(MAX_SPEED + 1e-9)
  })

  it("settles a lone orb in place", () => {
    const sim = createSim({ ids: ["a"], x: [640], y: [300], edges: [], area: AREA })
    sim.settle()
    expect(sim.x[0]).toBeCloseTo(640, 0)
    expect(sim.y[0]).toBeCloseTo(300, 0)
  })
})

describe("scale", () => {
  it("handles 300 memories without blowing up", () => {
    const names = ids(300)
    const edges: Edge[] = []
    for (let i = 0; i < 300; i += 3) edges.push({ a: i, b: i + 1, weight: 0.6 }, { a: i + 1, b: i + 2, weight: 0.5 })
    const sim = make(names, edges)
    const started = performance.now()
    run(sim, 600)
    // Per step the work is O(n + edges + nearby pairs), so this is a loose guard against anything quadratic.
    expect(performance.now() - started).toBeLessThan(3000)
    for (let i = 0; i < sim.count; i++) {
      expect(Number.isFinite(sim.x[i])).toBe(true)
      expect(speed(sim, i)).toBeLessThanOrEqual(MAX_SPEED + 1e-9)
    }
  })
})
