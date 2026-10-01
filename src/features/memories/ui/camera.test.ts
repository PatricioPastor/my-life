import { describe, expect, it } from "vitest"
import {
  MAX_ZOOM,
  MIN_ZOOM,
  applyVelocity,
  clampCamera,
  fitBounds,
  flightAt,
  flightDuration,
  focusCamera,
  inertiaStep,
  minZoomFor,
  panBy,
  panWithResistance,
  parallaxOffset,
  relaxCamera,
  screenToWorld,
  worldBounds,
  focusAmount,
  orbScale,
  settleAt,
  worldToScreen,
  zoomAbout,
  type Camera,
} from "./camera"

const vp = { width: 1440, height: 900 }
const cam: Camera = { x: 600, y: 400, zoom: 1.5 }

describe("screen and world", () => {
  it("puts the camera point at the middle of the viewport", () => {
    expect(worldToScreen(cam, vp, { x: 600, y: 400 })).toEqual({ x: 720, y: 450 })
  })

  it("scales by the zoom around that middle", () => {
    expect(worldToScreen(cam, vp, { x: 700, y: 400 })).toEqual({ x: 870, y: 450 })
  })

  it("round-trips screen to world and back", () => {
    for (const p of [{ x: 0, y: 0 }, { x: 1440, y: 900 }, { x: 333.3, y: 71.7 }]) {
      const back = worldToScreen(cam, vp, screenToWorld(cam, vp, p))
      expect(back.x).toBeCloseTo(p.x, 9)
      expect(back.y).toBeCloseTo(p.y, 9)
    }
  })
})

describe("zoomAbout", () => {
  it("keeps the world point under the pointer where it was", () => {
    const pointer = { x: 1100, y: 200 }
    const before = screenToWorld(cam, vp, pointer)
    for (const factor of [0.5, 0.8, 1.3, 2]) {
      const next = zoomAbout(cam, vp, pointer, factor)
      const after = screenToWorld(next, vp, pointer)
      expect(after.x).toBeCloseTo(before.x, 9)
      expect(after.y).toBeCloseTo(before.y, 9)
    }
  })

  it("multiplies the zoom by the factor", () => {
    expect(zoomAbout(cam, vp, { x: 720, y: 450 }, 1.2).zoom).toBeCloseTo(1.8, 9)
  })

  it("stays inside the zoom range, and still keeps the point fixed when it is cut short", () => {
    const pointer = { x: 100, y: 800 }
    const before = screenToWorld(cam, vp, pointer)
    const up = zoomAbout(cam, vp, pointer, 100)
    expect(up.zoom).toBe(MAX_ZOOM)
    const down = zoomAbout(cam, vp, pointer, 0.001)
    expect(down.zoom).toBe(MIN_ZOOM)
    for (const next of [up, down]) {
      const after = screenToWorld(next, vp, pointer)
      expect(after.x).toBeCloseTo(before.x, 9)
      expect(after.y).toBeCloseTo(before.y, 9)
    }
  })

  it("allows a lower floor when the world is big", () => {
    expect(zoomAbout(cam, vp, { x: 0, y: 0 }, 0.0001, 0.2).zoom).toBe(0.2)
  })
})

describe("panBy", () => {
  it("moves the camera against the drag, in world units", () => {
    expect(panBy(cam, 30, -15)).toEqual({ x: 580, y: 410, zoom: 1.5 })
  })
})

describe("inertia", () => {
  it("decays toward rest and never reverses", () => {
    let v = { x: 900, y: -400 }
    let last = Math.hypot(v.x, v.y)
    for (let i = 0; i < 400; i++) {
      v = inertiaStep(v, 1 / 60)
      const speed = Math.hypot(v.x, v.y)
      expect(speed).toBeLessThanOrEqual(last)
      expect(v.x).toBeGreaterThanOrEqual(0)
      last = speed
    }
    expect(v).toEqual({ x: 0, y: 0 })
  })

  it("is the same whatever the frame rate", () => {
    let a = { x: 600, y: 0 }
    for (let i = 0; i < 30; i++) a = inertiaStep(a, 1 / 60)
    let b = { x: 600, y: 0 }
    for (let i = 0; i < 15; i++) b = inertiaStep(b, 1 / 30)
    expect(a.x).toBeCloseTo(b.x, 6)
  })

  it("moves the camera by the velocity, in screen px per second", () => {
    expect(applyVelocity(cam, { x: 150, y: 0 }, 0.5)).toEqual({ x: 550, y: 400, zoom: 1.5 })
  })
})

describe("bounds", () => {
  const bounds = { left: 0, top: 0, right: 2000, bottom: 1200 }

  it("clamps the camera center into the world", () => {
    expect(clampCamera({ x: -300, y: 5000, zoom: 1 }, bounds)).toEqual({ x: 0, y: 1200, zoom: 1 })
    expect(clampCamera({ x: 700, y: 500, zoom: 1 }, bounds)).toEqual({ x: 700, y: 500, zoom: 1 })
  })

  it("lets a drag past the edge with growing resistance, never beyond the slack", () => {
    const slack = 120
    let c: Camera = { x: 1990, y: 600, zoom: 1 }
    const steps: number[] = []
    for (let i = 0; i < 80; i++) {
      const next = panWithResistance(c, -20, 0, bounds, slack)
      steps.push(next.x - c.x)
      c = next
    }
    expect(steps[0]).toBeGreaterThan(steps[steps.length - 1])
    expect(c.x).toBeLessThanOrEqual(bounds.right + slack)
    expect(c.x).toBeGreaterThan(bounds.right)
  })

  it("moves freely inside the world", () => {
    expect(panWithResistance({ x: 500, y: 500, zoom: 2 }, 40, 0, bounds, 120)).toEqual({ x: 480, y: 500, zoom: 2 })
  })

  it("eases back inside the world once released", () => {
    let c: Camera = { x: 2100, y: -60, zoom: 1 }
    for (let i = 0; i < 240; i++) c = relaxCamera(c, bounds, 1 / 60)
    expect(c.x).toBeCloseTo(2000, 1)
    expect(c.y).toBeCloseTo(0, 1)
  })

  it("leaves a camera that is inside alone", () => {
    const c: Camera = { x: 10, y: 10, zoom: 1 }
    expect(relaxCamera(c, bounds, 1 / 60)).toBe(c)
  })
})

describe("worldBounds", () => {
  const area = (n: number, aspect = 1.6) => {
    const b = worldBounds(n, aspect)
    return (b.right - b.left) * (b.bottom - b.top)
  }

  it("keeps the aspect it is given", () => {
    const b = worldBounds(30, 1.6)
    expect((b.right - b.left) / (b.bottom - b.top)).toBeCloseTo(1.6, 6)
  })

  it("starts at the origin", () => {
    const b = worldBounds(30, 1.6)
    expect([b.left, b.top]).toEqual([0, 0])
  })

  it("grows the area with the number of memories, so each side grows with its square root", () => {
    const small = worldBounds(100, 1.6)
    const big = worldBounds(400, 1.6)
    expect((big.right - big.left) / (small.right - small.left)).toBeCloseTo(2, 6)
  })

  it("never shrinks below a room of its own for a handful of memories", () => {
    expect(area(0)).toBe(area(1))
    expect(area(3)).toBe(area(0))
  })

  it("limits odd aspects so a phone gets a tall world and not a sliver", () => {
    const tall = worldBounds(30, 0.1)
    const wide = worldBounds(30, 10)
    expect((tall.right - tall.left) / (tall.bottom - tall.top)).toBeGreaterThanOrEqual(0.6 - 1e-9)
    expect((wide.right - wide.left) / (wide.bottom - wide.top)).toBeLessThanOrEqual(1.8 + 1e-9)
  })
})

describe("fitBounds", () => {
  const box = { left: 100, top: 100, right: 1700, bottom: 1000 }
  const pad = { top: 80, right: 40, bottom: 140, left: 40 }

  it("shows the whole box inside the padded viewport", () => {
    const fit = fitBounds(box, vp, pad)
    const a = worldToScreen(fit, vp, { x: box.left, y: box.top })
    const b = worldToScreen(fit, vp, { x: box.right, y: box.bottom })
    expect(a.x).toBeGreaterThanOrEqual(pad.left - 1e-6)
    expect(a.y).toBeGreaterThanOrEqual(pad.top - 1e-6)
    expect(b.x).toBeLessThanOrEqual(vp.width - pad.right + 1e-6)
    expect(b.y).toBeLessThanOrEqual(vp.height - pad.bottom + 1e-6)
  })

  it("is as big as it can be: one side touches the padding", () => {
    const fit = fitBounds(box, vp, pad)
    const a = worldToScreen(fit, vp, { x: box.left, y: box.top })
    const b = worldToScreen(fit, vp, { x: box.right, y: box.bottom })
    const touchesX = Math.abs(a.x - pad.left) < 1e-6 && Math.abs(b.x - (vp.width - pad.right)) < 1e-6
    const touchesY = Math.abs(a.y - pad.top) < 1e-6 && Math.abs(b.y - (vp.height - pad.bottom)) < 1e-6
    expect(touchesX || touchesY).toBe(true)
  })

  it("does not magnify a tiny constellation past the cap", () => {
    const fit = fitBounds({ left: 0, top: 0, right: 40, bottom: 40 }, vp, pad)
    expect(fit.zoom).toBeLessThanOrEqual(1.15)
  })

  it("may go below the usual floor for a huge world, never to zero", () => {
    const huge = { left: 0, top: 0, right: 12000, bottom: 8000 }
    const fit = fitBounds(huge, vp, pad, minZoomFor(huge, vp, pad))
    expect(fit.zoom).toBeLessThan(MIN_ZOOM)
    expect(fit.zoom).toBeGreaterThan(0)
    expect(minZoomFor(box, vp, pad)).toBe(MIN_ZOOM)
  })
})

describe("focusCamera", () => {
  it("puts a world point at the anchor of the viewport", () => {
    const target = { x: 900, y: 500 }
    const focus = focusCamera(target, vp, 2.4, { x: 0.5, y: 0.42 })
    const at = worldToScreen(focus, vp, target)
    expect(at.x).toBeCloseTo(720, 9)
    expect(at.y).toBeCloseTo(900 * 0.42, 9)
    expect(focus.zoom).toBe(2.4)
  })
})

describe("flight", () => {
  const from: Camera = { x: 100, y: 100, zoom: 0.8 }
  const to: Camera = { x: 1500, y: 900, zoom: 2.4 }

  it("takes between 0.9 and 1.4 seconds, longer the farther it goes", () => {
    const hop = flightDuration(from, { ...from, x: 130 })
    const trip = flightDuration(from, to)
    const far = flightDuration({ ...from, zoom: 0.35 }, { x: 9000, y: 6000, zoom: 3 })
    expect(hop).toBeGreaterThanOrEqual(0.9)
    expect(hop).toBeLessThan(trip)
    expect(trip).toBeLessThan(far)
    expect(far).toBeLessThanOrEqual(1.4)
  })

  it("starts exactly at the origin and ends exactly at the target", () => {
    expect(flightAt(from, to, 0)).toEqual(from)
    expect(flightAt(from, to, 1)).toEqual(to)
  })

  it("is slow at the start and fast in the middle", () => {
    const quarter = flightAt(from, to, 0.25)
    const progress = (quarter.x - from.x) / (to.x - from.x)
    expect(progress).toBeGreaterThan(0)
    expect(progress).toBeLessThan(0.15)
    const swing = flightAt(from, to, 0.7).x - flightAt(from, to, 0.3).x
    expect(swing / (to.x - from.x)).toBeGreaterThan(0.6)
  })

  it("never overshoots and never goes backwards", () => {
    let last = flightAt(from, to, 0)
    for (let i = 1; i <= 200; i++) {
      const c = flightAt(from, to, i / 200)
      expect(c.x).toBeGreaterThanOrEqual(last.x)
      expect(c.y).toBeGreaterThanOrEqual(last.y)
      expect(c.zoom).toBeGreaterThanOrEqual(last.zoom)
      expect(c.x).toBeLessThanOrEqual(to.x)
      expect(c.zoom).toBeLessThanOrEqual(to.zoom + 1e-9)
      last = c
    }
  })

  it("zooms evenly in the logarithm, so it feels the same going in or out", () => {
    const mid = flightAt({ x: 0, y: 0, zoom: 0.5 }, { x: 0, y: 0, zoom: 2 }, 0.5)
    expect(mid.zoom).toBeGreaterThan(0.5)
    expect(mid.zoom).toBeLessThan(2)
    const back = flightAt({ x: 0, y: 0, zoom: 2 }, { x: 0, y: 0, zoom: 0.5 }, 0.5)
    expect(mid.zoom * back.zoom).toBeCloseTo(1, 9)
  })
})

describe("parallaxOffset", () => {
  const home: Camera = { x: 800, y: 500, zoom: 1 }

  it("is zero at the home camera", () => {
    expect(parallaxOffset(home, home, 0.5)).toEqual({ x: 0, y: 0 })
  })

  it("moves far layers less than near ones, against the camera", () => {
    const moved: Camera = { x: 1000, y: 500, zoom: 1 }
    const far = parallaxOffset(moved, home, 0.1)
    const near = parallaxOffset(moved, home, 0.6)
    expect(far.x).toBeLessThan(0)
    expect(near.x).toBeLessThan(far.x)
    expect(Math.abs(far.x)).toBeLessThan(Math.abs(near.x))
  })
})

describe("settleAt (short moves)", () => {
  const from: Camera = { x: 0, y: 0, zoom: 1 }
  const to: Camera = { x: 100, y: -40, zoom: 2 }

  it("starts and ends exactly on the cameras it is given", () => {
    expect(settleAt(from, to, 0)).toEqual(from)
    expect(settleAt(from, to, 1)).toEqual(to)
  })

  it("starts fast and settles, never overshooting", () => {
    expect(settleAt(from, to, 0.25).x).toBeGreaterThan(50)
    let last = 0
    for (let i = 1; i <= 100; i++) {
      const x = settleAt(from, to, i / 100).x
      expect(x).toBeGreaterThanOrEqual(last)
      expect(x).toBeLessThanOrEqual(100)
      last = x
    }
  })
})

describe("orbScale", () => {
  it("is 1 at the home zoom, grows slower than the zoom and stays within limits", () => {
    expect(orbScale(1)).toBe(1)
    expect(orbScale(2)).toBeGreaterThan(1)
    expect(orbScale(2)).toBeLessThan(2)
    expect(orbScale(0.01)).toBe(0.7)
    expect(orbScale(100)).toBe(2.2)
  })
})

describe("focusAmount", () => {
  it("is 0 while still far, 1 once the camera has arrived, and rises smoothly in between", () => {
    expect(focusAmount(0.8, 2.4)).toBe(0)
    expect(focusAmount(2.4, 2.4)).toBe(1)
    expect(focusAmount(3, 2.4)).toBe(1)
    let last = 0
    for (let z = 1; z <= 2.4; z += 0.05) {
      const a = focusAmount(z, 2.4)
      expect(a).toBeGreaterThanOrEqual(last)
      last = a
    }
  })
})
