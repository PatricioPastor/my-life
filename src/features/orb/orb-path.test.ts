import { describe, expect, it } from "vitest"
import { createOrbPath, distanceToRect, type Rect } from "./orb-path"

interface Scene {
  width: number
  height: number
  keepOut: Rect[]
  clearance: number
  margin: number
}

// The 1440x900 sky: four stars with labels to their right, the name mark, the bottom controls.
function desktop(): Scene {
  const width = 1440
  const height = 900
  const star = (x: number, y: number): Rect => ({ left: x - 58, top: y - 58, right: x + 44 + 120, bottom: y + 58 })
  return {
    width,
    height,
    clearance: 64,
    margin: 72,
    keepOut: [
      star(0.21 * width, 0.32 * height),
      star(0.57 * width, 0.21 * height),
      star(0.75 * width, 0.55 * height),
      star(0.39 * width, 0.71 * height),
      { left: 0, top: 0, right: 240, bottom: 96 },
      { left: 0, top: height - 104, right: 260, bottom: height },
    ],
  }
}

// A phone has less room, so the orb is smaller and keeps a smaller berth.
function phone(): Scene {
  const width = 390
  const height = 844
  const star = (x: number, y: number, side: 1 | -1): Rect => ({
    left: side === 1 ? x - 32 : x - 44 - 100,
    top: y - 32,
    right: side === 1 ? x + 44 + 100 : x + 32,
    bottom: y + 32,
  })
  return {
    width,
    height,
    clearance: 41,
    margin: 44,
    keepOut: [
      star(0.21 * width, 0.32 * height, 1),
      star(0.57 * width, 0.21 * height, -1),
      star(0.75 * width, 0.55 * height, -1),
      star(0.39 * width, 0.71 * height, 1),
      { left: 0, top: 0, right: 210, bottom: 64 },
      { left: 0, top: height - 84, right: 170, bottom: height },
    ],
  }
}

const SEEDS = [1, 7, 42, 2026, 99991]
const config = (seed: number, scene = desktop()) => ({ seed, ...scene })

describe("createOrbPath", () => {
  it("is deterministic for a seed and independent of the order it is sampled in", () => {
    const a = createOrbPath(config(42))
    const b = createOrbPath(config(42))
    const late = b(900.5)
    for (let t = 0; t <= 900; t += 37.3) expect(a(t)).toEqual(b(t))
    expect(a(900.5)).toEqual(late)
  })

  it("wanders differently for different seeds", () => {
    const a = createOrbPath(config(1))
    const b = createOrbPath(config(2))
    expect([40, 120, 300].some((t) => a(t).x !== b(t).x)).toBe(true)
  })

  it("stays inside the safe margin of the viewport", () => {
    for (const scene of [desktop(), phone()]) {
      for (const seed of SEEDS) {
        const path = createOrbPath(config(seed, scene))
        for (let t = 0; t <= 1800; t += 0.5) {
          const { x, y } = path(t)
          expect(x).toBeGreaterThanOrEqual(scene.margin - 1e-6)
          expect(x).toBeLessThanOrEqual(scene.width - scene.margin + 1e-6)
          expect(y).toBeGreaterThanOrEqual(scene.margin - 1e-6)
          expect(y).toBeLessThanOrEqual(scene.height - scene.margin + 1e-6)
        }
      }
    }
  })

  it("keeps its clearance from every star and reserved zone at all sampled times", () => {
    for (const scene of [desktop(), phone()]) {
      for (const seed of SEEDS) {
        const path = createOrbPath(config(seed, scene))
        for (let t = 0; t <= 1800; t += 0.5) {
          const p = path(t)
          for (const rect of scene.keepOut) expect(distanceToRect(p, rect)).toBeGreaterThanOrEqual(scene.clearance - 1e-6)
        }
      }
    }
  })

  it("is continuous: no jumps between frames, and the velocity never turns sharply", () => {
    const dt = 1 / 60
    for (const scene of [desktop(), phone()]) {
      for (const seed of SEEDS) {
        const path = createOrbPath(config(seed, scene))
        let prev = path(0)
        const opening = path(dt)
        let prevStep = Math.hypot(opening.x - prev.x, opening.y - prev.y)
        prev = opening
        for (let t = 2 * dt; t <= 600; t += dt) {
          const p = path(t)
          const step = Math.hypot(p.x - prev.x, p.y - prev.y)
          // Calm: well under 3 px per frame (180 px/s), and no frame-to-frame lurch.
          expect(step).toBeLessThan(3)
          expect(Math.abs(step - prevStep)).toBeLessThan(0.25)
          prev = p
          prevStep = step
        }
      }
    }
  }, 30_000)

  it("keeps moving on a phone too, where there is little free room", () => {
    for (const seed of SEEDS) {
      const path = createOrbPath(config(seed, phone()))
      let travelled = 0
      let prev = path(0)
      for (let t = 1; t <= 300; t += 1) {
        const p = path(t)
        travelled += Math.hypot(p.x - prev.x, p.y - prev.y)
        prev = p
      }
      expect(travelled / 300).toBeGreaterThan(8)
    }
  })

  it("moves slowly and keeps moving", () => {
    const path = createOrbPath(config(42))
    let travelled = 0
    let prev = path(0)
    for (let t = 1; t <= 300; t += 1) {
      const p = path(t)
      travelled += Math.hypot(p.x - prev.x, p.y - prev.y)
      prev = p
    }
    const speed = travelled / 300
    expect(speed).toBeGreaterThan(8)
    expect(speed).toBeLessThan(45)
  })

  it("roams the whole viewport over time", () => {
    const scene = desktop()
    const path = createOrbPath(config(42, scene))
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (let t = 0; t <= 3000; t += 1) {
      const { x, y } = path(t)
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    expect(maxX - minX).toBeGreaterThan(scene.width * 0.6)
    expect(maxY - minY).toBeGreaterThan(scene.height * 0.5)
  })

  it("treats negative and non-finite times as the start", () => {
    const path = createOrbPath(config(42))
    expect(path(-5)).toEqual(path(0))
    expect(path(Number.NaN)).toEqual(path(0))
  })

  it("never throws or hangs when there is no free room", () => {
    const path = createOrbPath({
      seed: 3,
      width: 120,
      height: 120,
      margin: 72,
      clearance: 64,
      keepOut: [{ left: 0, top: 0, right: 120, bottom: 120 }],
    })
    const p = path(10)
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
  })
})

describe("distanceToRect", () => {
  const rect: Rect = { left: 10, top: 10, right: 30, bottom: 20 }
  it("is zero inside and euclidean outside", () => {
    expect(distanceToRect({ x: 20, y: 15 }, rect)).toBe(0)
    expect(distanceToRect({ x: 40, y: 15 }, rect)).toBe(10)
    expect(distanceToRect({ x: 33, y: 24 }, rect)).toBe(5)
  })
})
