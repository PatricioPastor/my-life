import { describe, expect, it } from "vitest"
import { screenToWorld, type Camera } from "./camera"
import {
  DOUBLE_TAP_MS,
  DRAG_THRESHOLD,
  MAX_FLICK_SPEED,
  dragStep,
  exceedsDrag,
  isDoubleTap,
  keyAction,
  pinchStep,
  sampleVelocity,
  wheelFactor,
  wheelZoom,
} from "./gestures"

const vp = { width: 1000, height: 700 }
const cam: Camera = { x: 500, y: 350, zoom: 1 }

describe("drag", () => {
  it("pans the camera against the pointer", () => {
    expect(dragStep(cam, 50, -20)).toEqual({ x: 450, y: 370, zoom: 1 })
  })

  it("is not a drag until it passes a small threshold, so a tap stays a tap", () => {
    expect(exceedsDrag(2, 3)).toBe(false)
    expect(exceedsDrag(DRAG_THRESHOLD, 0)).toBe(true)
    expect(exceedsDrag(-4, 5)).toBe(true)
  })

  it("estimates the release velocity from the recent movement", () => {
    let v = { x: 0, y: 0 }
    for (let i = 0; i < 20; i++) v = sampleVelocity(v, 10, 0, 1 / 60)
    expect(v.x).toBeGreaterThan(500)
    expect(v.x).toBeLessThanOrEqual(600 + 1e-6)
    expect(v.y).toBe(0)
  })

  it("caps a flick so a burst of events cannot send the camera flying", () => {
    const v = sampleVelocity({ x: 0, y: 0 }, 400, -400, 0.002)
    expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(MAX_FLICK_SPEED + 1e-6)
    expect(v.x).toBeGreaterThan(0)
    expect(v.y).toBeLessThan(0)
  })

  it("ignores a zero-length frame", () => {
    expect(sampleVelocity({ x: 5, y: 5 }, 10, 10, 0)).toEqual({ x: 5, y: 5 })
  })
})

describe("wheel", () => {
  it("zooms in when scrolling up and out when scrolling down", () => {
    expect(wheelFactor({ deltaY: -100, deltaMode: 0, ctrlKey: false })).toBeGreaterThan(1)
    expect(wheelFactor({ deltaY: 100, deltaMode: 0, ctrlKey: false })).toBeLessThan(1)
  })

  it("is exactly reversible", () => {
    const up = wheelFactor({ deltaY: -120, deltaMode: 0, ctrlKey: false })
    const down = wheelFactor({ deltaY: 120, deltaMode: 0, ctrlKey: false })
    expect(up * down).toBeCloseTo(1, 9)
  })

  it("reads a trackpad pinch (ctrl + small deltas) as a stronger zoom than a plain scroll", () => {
    const plain = wheelFactor({ deltaY: -4, deltaMode: 0, ctrlKey: false })
    const pinch = wheelFactor({ deltaY: -4, deltaMode: 0, ctrlKey: true })
    expect(pinch).toBeGreaterThan(plain)
  })

  it("treats lines as bigger steps than pixels", () => {
    const px = wheelFactor({ deltaY: -3, deltaMode: 0, ctrlKey: false })
    const lines = wheelFactor({ deltaY: -3, deltaMode: 1, ctrlKey: false })
    expect(lines).toBeGreaterThan(px)
  })

  it("caps one event so a huge delta cannot jump the whole range", () => {
    const f = wheelFactor({ deltaY: -100000, deltaMode: 0, ctrlKey: false })
    expect(f).toBeLessThanOrEqual(2)
    expect(f).toBeGreaterThan(1)
  })

  it("zooms toward the pointer", () => {
    const pointer = { x: 800, y: 100 }
    const before = screenToWorld(cam, vp, pointer)
    const next = wheelZoom(cam, vp, pointer, { deltaY: -200, deltaMode: 0, ctrlKey: false })
    expect(next.zoom).toBeGreaterThan(1)
    const after = screenToWorld(next, vp, pointer)
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.y).toBeCloseTo(before.y, 9)
  })
})

describe("pinch", () => {
  const pair = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } })

  it("zooms by the ratio of the finger distance", () => {
    const next = pinchStep(cam, vp, pair(400, 350, 600, 350), pair(300, 350, 700, 350))
    expect(next.zoom).toBeCloseTo(2, 9)
  })

  it("keeps the world point under the fingers' middle under that middle", () => {
    const prev = pair(400, 300, 600, 400)
    const next = pair(350, 250, 650, 450)
    const world = screenToWorld(cam, vp, { x: 500, y: 350 })
    const moved = pinchStep(cam, vp, prev, next)
    const at = screenToWorld(moved, vp, { x: 500, y: 350 })
    expect(at.x).toBeCloseTo(world.x, 6)
    expect(at.y).toBeCloseTo(world.y, 6)
  })

  it("pans when the fingers move together without changing distance", () => {
    const next = pinchStep(cam, vp, pair(400, 350, 600, 350), pair(450, 350, 650, 350))
    expect(next.zoom).toBeCloseTo(1, 9)
    expect(next.x).toBeCloseTo(450, 9)
  })

  it("does nothing when the fingers collapse on each other", () => {
    expect(pinchStep(cam, vp, pair(400, 350, 400, 350), pair(300, 350, 700, 350))).toEqual(cam)
  })
})

describe("double tap", () => {
  const tap = (t: number, x: number, y: number) => ({ t, x, y })

  it("is two taps, close in time and place", () => {
    expect(isDoubleTap(tap(1000, 100, 100), tap(1000 + DOUBLE_TAP_MS - 10, 110, 95))).toBe(true)
  })

  it("is not when they are slow, far apart, or the first one is missing", () => {
    expect(isDoubleTap(tap(1000, 100, 100), tap(1000 + DOUBLE_TAP_MS + 50, 100, 100))).toBe(false)
    expect(isDoubleTap(tap(1000, 100, 100), tap(1100, 220, 100))).toBe(false)
    expect(isDoubleTap(null, tap(1100, 100, 100))).toBe(false)
  })
})

describe("keys", () => {
  it("pans with the arrows: the world slides the way the key points", () => {
    const left = keyAction("ArrowLeft")
    const right = keyAction("ArrowRight")
    const up = keyAction("ArrowUp")
    const down = keyAction("ArrowDown")
    // The arrow moves the view, so the drag-like delta on the world is opposite: left arrow, positive dx.
    expect(left && left.type === "pan" && left.dx).toBeGreaterThan(0)
    expect(right && right.type === "pan" && right.dx).toBeLessThan(0)
    expect(up && up.type === "pan" && up.dy).toBeGreaterThan(0)
    expect(down && down.type === "pan" && down.dy).toBeLessThan(0)
  })

  it("zooms with + and - (and =), and fits everything with 0", () => {
    const plus = keyAction("+")
    const minus = keyAction("-")
    expect(plus && plus.type === "zoom" && plus.factor).toBeGreaterThan(1)
    expect(minus && minus.type === "zoom" && minus.factor).toBeLessThan(1)
    expect(keyAction("=")).toEqual(plus)
    expect(keyAction("_")).toEqual(minus)
    expect(keyAction("0")).toEqual({ type: "fit" })
  })

  it("ignores every other key", () => {
    expect(keyAction("a")).toBeNull()
    expect(keyAction("Enter")).toBeNull()
    expect(keyAction("Escape")).toBeNull()
  })
})
