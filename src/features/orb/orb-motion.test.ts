import { describe, expect, it } from "vitest"
import { createOrbMotion, orbMetrics, stepRate, type OrbFrame, type OrbMotion } from "./orb-motion"
import { summonDuration, summonLanding } from "./orb-summon"
import { LENS_SHARE, PEEK_MAX_SCALE } from "./orb-peek"
import { distanceToRect, type Point, type Rect } from "./orb-path"

const DT = 1 / 60
const keepOut: Rect[] = [
  { left: 0, top: 0, right: 240, bottom: 96 },
  { left: 300, top: 300, right: 500, bottom: 460 },
]
const make = (reduced = false) => {
  const motion = createOrbMotion({ seed: 42, reduced })
  motion.setViewport(1440, 900, keepOut)
  return motion
}
const FREE = { held: false, active: true }
const HELD = { held: true, active: true }
const HIDDEN = { held: false, active: false }

describe("stepRate", () => {
  it("eases down to a stop while captured, never below zero", () => {
    let rate = 1
    let prev = rate
    for (let i = 0; i < 60 * 3; i++) {
      rate = stepRate(rate, true, DT)
      expect(rate).toBeLessThanOrEqual(prev)
      expect(rate).toBeGreaterThanOrEqual(0)
      prev = rate
    }
    expect(rate).toBeLessThan(0.01)
  })

  it("is already slowing in the first moments, but not an instant stop", () => {
    const after = stepRate(1, true, DT)
    expect(after).toBeLessThan(1)
    expect(after).toBeGreaterThan(0.9)
  })

  it("resumes smoothly once released, never above full speed", () => {
    let rate = 0
    let prev = rate
    for (let i = 0; i < 60 * 4; i++) {
      rate = stepRate(rate, false, DT)
      expect(rate).toBeGreaterThanOrEqual(prev)
      expect(rate).toBeLessThanOrEqual(1)
      expect(rate - prev).toBeLessThan(0.05)
      prev = rate
    }
    expect(rate).toBeGreaterThan(0.99)
  })
})

describe("createOrbMotion", () => {
  it("is deterministic for a seed", () => {
    const a = make()
    const b = make()
    for (let i = 0; i < 600; i++) expect(a.step(DT, FREE)).toEqual(b.step(DT, FREE))
  })

  it("eases to a stop when captured and resumes without a jump", () => {
    const m = make()
    for (let i = 0; i < 600; i++) m.step(DT, FREE)
    let prev = m.step(DT, FREE)
    const steps: number[] = []
    for (let i = 0; i < 60 * 4; i++) {
      const f = m.step(DT, HELD)
      steps.push(Math.hypot(f.x - prev.x, f.y - prev.y))
      prev = f
    }
    expect(steps[0]).toBeGreaterThan(0)
    // Monotone slowdown, and at rest by the end.
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThanOrEqual(steps[i - 1] + 1e-9)
    expect(steps.at(-1)!).toBeLessThan(0.01)
    // Releasing: the first frames barely move, then it speeds up with no lurch.
    const resumed: number[] = []
    for (let i = 0; i < 60 * 3; i++) {
      const f = m.step(DT, FREE)
      resumed.push(Math.hypot(f.x - prev.x, f.y - prev.y))
      prev = f
    }
    expect(resumed[0]).toBeLessThan(0.05)
    for (let i = 1; i < resumed.length; i++) expect(Math.abs(resumed[i] - resumed[i - 1])).toBeLessThan(0.06)
    expect(Math.max(...resumed)).toBeGreaterThan(0.1)
  })

  it("fades in with the sky and out when it is no longer shown", () => {
    const m = make()
    expect(m.step(DT, HIDDEN).energy).toBe(0)
    let e = 0
    for (let i = 0; i < 60 * 3; i++) e = m.step(DT, FREE).energy
    expect(e).toBeGreaterThan(0.9)
    for (let i = 0; i < 60 * 3; i++) e = m.step(DT, HIDDEN).energy
    expect(e).toBeLessThan(0.02)
  })

  it("lifts a little when held, as an affordance", () => {
    const m = make()
    let free = m.step(DT, FREE)
    for (let i = 0; i < 300; i++) free = m.step(DT, FREE)
    let held = free
    for (let i = 0; i < 300; i++) held = m.step(DT, HELD)
    expect(held.radius).toBeGreaterThan(free.radius)
  })

  it("under reduced motion drifts near-static and shifts color slowly", () => {
    const normal = make(false)
    const calm = make(true)
    const a0 = normal.step(DT, FREE)
    const b0 = calm.step(DT, FREE)
    let a = a0
    let b = b0
    let hueNormal = 0
    let hueCalm = 0
    for (let i = 0; i < 60 * 20; i++) {
      const na = normal.step(DT, FREE)
      const nb = calm.step(DT, FREE)
      hueNormal += Math.abs(na.hue - a.hue)
      hueCalm += Math.abs(nb.hue - b.hue)
      a = na
      b = nb
    }
    const dNormal = Math.hypot(a.x - a0.x, a.y - a0.y)
    const dCalm = Math.hypot(b.x - b0.x, b.y - b0.y)
    expect(dCalm).toBeGreaterThan(0)
    expect(dCalm).toBeLessThan(dNormal * 0.25)
    expect(hueCalm).toBeLessThan(hueNormal * 0.5)
  })

  it("keeps its frame inside the viewport and its colour in gamut", () => {
    const m = make()
    for (let i = 0; i < 60 * 120; i++) {
      const f = m.step(DT, FREE)
      expect(f.x).toBeGreaterThan(0)
      expect(f.x).toBeLessThan(1440)
      expect(f.y).toBeGreaterThan(0)
      expect(f.y).toBeLessThan(900)
      f.rgb.forEach((v) => expect(v >= 0 && v <= 1).toBe(true))
    }
  })

  it("ignores a stalled frame instead of jumping", () => {
    const m = make()
    const before = m.step(DT, FREE)
    const after = m.step(5, FREE)
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(10)
  })
})

describe("orbMetrics", () => {
  it("gives a phone a smaller orb with a smaller berth, and a desktop a larger one", () => {
    const phone = orbMetrics(390, 844)
    const desktop = orbMetrics(1440, 900)
    expect(phone.radius).toBeLessThan(desktop.radius)
    expect(phone.clearance).toBeLessThan(desktop.clearance)
    expect(phone.margin).toBeGreaterThan(phone.clearance)
  })

  it("keeps the glow's reach inside the clearance", () => {
    for (const [w, h] of [[390, 844], [768, 1024], [1440, 900], [2560, 1440]]) {
      const m = orbMetrics(w, h)
      expect(m.clearance).toBeGreaterThanOrEqual(m.radius * 1.2)
    }
  })
})

describe("the peek", () => {
  const settle = (m: ReturnType<typeof make>, input: { held: boolean; active: boolean; parked?: boolean }, frames: number) => {
    let f = m.step(DT, input)
    for (let i = 1; i < frames; i++) f = m.step(DT, input)
    return f
  }

  it("is 0 while it floats, and the lens is just the glow's own size", () => {
    const m = make()
    const f = settle(m, FREE, 120)
    expect(f.peek).toBe(0)
    expect(f.zoom).toBe(1)
    expect(f.lens).toBeCloseTo(f.radius * LENS_SHARE, 6)
  })

  it("rises to 1 within half a second of being held, and the lens grows by the scale", () => {
    const m = make()
    settle(m, FREE, 120)
    const f = settle(m, HELD, 30)
    expect(f.peek).toBeGreaterThan(0.97)
    expect(f.zoom).toBeGreaterThan(1.5)
    expect(f.zoom).toBeLessThanOrEqual(PEEK_MAX_SCALE)
    expect(f.lens).toBeGreaterThan(f.radius * LENS_SHARE * 1.5)
  })

  it("never zooms the glow itself: the lens grows, the radius only keeps its small lift", () => {
    const m = make()
    settle(m, FREE, 120)
    const free = m.step(DT, FREE)
    const held = settle(m, HELD, 120)
    expect(held.radius).toBeLessThan(free.radius * 1.2)
  })

  it("follows the target monotonically, in both directions", () => {
    const m = make()
    settle(m, FREE, 60)
    let prev = 0
    for (let i = 0; i < 60; i++) {
      const f = m.step(DT, HELD)
      expect(f.peek).toBeGreaterThanOrEqual(prev)
      prev = f.peek
    }
    for (let i = 0; i < 60; i++) {
      const f = m.step(DT, FREE)
      expect(f.peek).toBeLessThanOrEqual(prev)
      prev = f.peek
    }
    expect(prev).toBe(0)
  })

  it("is interruptible: holding again mid-release continues from the current value", () => {
    const m = make()
    settle(m, HELD, 60)
    const mid = settle(m, FREE, 8)
    expect(mid.peek).toBeGreaterThan(0.1)
    expect(mid.peek).toBeLessThan(0.95)
    const again = m.step(DT, HELD)
    expect(again.peek).toBeGreaterThan(mid.peek)
    expect(again.peek - mid.peek).toBeLessThan(0.15)
    expect(Math.abs(again.lens - mid.lens)).toBeLessThan(6)
  })

  it("keeps the lens off the keep-out boxes and the screen edge all along the path", () => {
    const m = make()
    for (let i = 0; i < 60 * 90; i++) {
      const f = settle(m, i % 400 < 200 ? HELD : FREE, 1)
      const edge = Math.min(f.x, f.y, 1440 - f.x, 900 - f.y)
      expect(f.lens).toBeLessThanOrEqual(Math.max(edge, f.radius * LENS_SHARE) + 1e-6)
      for (const b of keepOut) {
        const gap = Math.hypot(Math.max(b.left - f.x, 0, f.x - b.right), Math.max(b.top - f.y, 0, f.y - b.bottom))
        expect(f.lens).toBeLessThanOrEqual(Math.max(gap, f.radius * LENS_SHARE) + 1e-6)
      }
    }
  })

  it("under reduced motion crossfades to the preview without growing", () => {
    const m = make(true)
    const rest = settle(m, FREE, 60)
    const f = settle(m, HELD, 30)
    expect(f.peek).toBe(1)
    expect(f.zoom).toBe(1)
    expect(f.lens).toBeCloseTo(rest.lens, 6)
  })

  it("parks the orb on a trip without peeking", () => {
    const m = make()
    settle(m, FREE, 120)
    const before = m.step(DT, FREE)
    const parked = settle(m, { held: false, active: true, parked: true }, 240)
    expect(parked.peek).toBe(0)
    expect(Math.hypot(parked.x - before.x, parked.y - before.y)).toBeLessThan(20)
    expect(parked.rate).toBeLessThan(0.01)
  })
})

describe("summon", () => {
  const W = 1440
  const H = 900
  const m = orbMetrics(W, H)
  const landingFor = (pointer: Point) =>
    summonLanding({ pointer, width: W, height: H, keepOut, radius: m.radius, clearance: m.clearance, margin: m.margin })
  const pos = (f: OrbFrame): Point => ({ x: f.x, y: f.y })
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

  /** Steps `seconds` of frames, collecting them. `pointerAt` may change the pointer per frame. */
  function run(
    motion: OrbMotion,
    seconds: number,
    input: Partial<Parameters<OrbMotion["step"]>[1]> = {},
    pointerAt?: (t: number) => Point | null,
  ): OrbFrame[] {
    const frames: OrbFrame[] = []
    const n = Math.round(seconds * 60)
    for (let i = 0; i < n; i++) {
      const pointer = pointerAt ? pointerAt(i / 60) : input.pointer
      frames.push(motion.step(DT, { held: false, active: true, ...input, pointer }))
    }
    return frames
  }
  const warm = (reduced = false) => {
    const motion = make(reduced)
    run(motion, 5)
    return motion
  }
  const POINTER: Point = { x: 1000, y: 620 }

  it("flies reluctantly, then fast, then settles exactly next to the cursor", () => {
    const motion = warm()
    const start = pos(run(motion, 1 / 60)[0])
    const target = landingFor(POINTER)
    const total = dist(start, target)
    const D = summonDuration(total)
    motion.summon()
    const frames = run(motion, D + 0.4, { pointer: POINTER })
    const at = (s: number) => dist(start, pos(frames[Math.round(s * 60) - 1]))
    expect(at(D * 0.25)).toBeLessThan(total * 0.15)
    expect(at(D * 0.7) - at(D * 0.3)).toBeGreaterThan(total * 0.55)
    const last = frames.at(-1)!
    expect(dist(pos(last), target)).toBeLessThan(0.01)
    expect(last.summon).toBe("holding")
  })

  it("never overshoots: the distance to the landing only shrinks", () => {
    const motion = warm()
    motion.summon()
    const frames = run(motion, 2, { pointer: POINTER })
    const target = landingFor(POINTER)
    let prev = Infinity
    for (const f of frames) {
      const d = dist(pos(f), target)
      expect(d).toBeLessThanOrEqual(prev + 0.5)
      prev = d
    }
  })

  it("moves from the very first frame without a jump", () => {
    const motion = warm()
    const before = pos(run(motion, 1 / 60)[0])
    motion.summon()
    const frames = run(motion, 0.5, { pointer: POINTER })
    let prev = before
    for (const f of frames) {
      expect(dist(pos(f), prev)).toBeLessThan(14)
      prev = pos(f)
    }
  })

  it("follows a cursor that moves mid-flight, with no jump and a continuous velocity", () => {
    const motion = warm()
    motion.summon()
    const a: Point = { x: 1000, y: 620 }
    const b: Point = { x: 1300, y: 420 }
    // The cursor jumps at 0.5 s, mid-flight: a worst case, far above what a hand does.
    const frames = run(motion, 2, {}, (t) => (t < 0.5 ? a : b))
    let maxStep = 0
    let maxAccel = 0
    let prevV: Point | null = null
    for (let i = 1; i < frames.length; i++) {
      const v = { x: frames[i].x - frames[i - 1].x, y: frames[i].y - frames[i - 1].y }
      maxStep = Math.max(maxStep, Math.hypot(v.x, v.y))
      if (prevV) maxAccel = Math.max(maxAccel, Math.hypot(v.x - prevV.x, v.y - prevV.y))
      prevV = v
    }
    // Per frame: far from a teleport, and the speed never changes abruptly.
    expect(maxStep).toBeLessThan(45)
    expect(maxAccel).toBeLessThan(4)
    expect(dist(pos(frames.at(-1)!), landingFor(b))).toBeLessThan(0.5)
  })

  it("lands on the final spot of the cursor even if it only moved late in the flight", () => {
    const motion = warm()
    motion.summon()
    const b: Point = { x: 400, y: 700 }
    const frames = run(motion, 2.5, {}, (t) => (t < 0.9 ? POINTER : b))
    expect(dist(pos(frames.at(-1)!), landingFor(b))).toBeLessThan(0.5)
  })

  it("ignores a second summon in flight: same arrival, no restart", () => {
    const one = warm()
    const two = warm()
    one.summon()
    two.summon()
    const a = run(one, 2, { pointer: POINTER })
    const b: OrbFrame[] = []
    for (let i = 0; i < 120; i++) {
      if (i === 30) two.summon()
      b.push(two.step(DT, { held: false, active: true, pointer: POINTER }))
    }
    for (let i = 0; i < 120; i++) expect(b[i]).toEqual(a[i])
  })

  it("parks near the cursor for about four seconds from arrival, however the cursor moves", () => {
    const motion = warm()
    motion.summon()
    const landed = run(motion, 2, { pointer: POINTER }).at(-1)!
    const frames = run(motion, 2.5, {}, (t) => ({ x: 300 + t * 100, y: 200 }))
    for (const f of frames) {
      expect(f.summon).toBe("holding")
      expect(dist(pos(f), pos(landed))).toBeLessThan(0.5)
    }
  })

  it("stays parked while hovered or captured, and the four seconds start over after", () => {
    const motion = warm()
    motion.summon()
    run(motion, 2, { pointer: POINTER })
    const held = run(motion, 10, { pointer: POINTER, held: true })
    expect(held.every((f) => f.summon === "holding")).toBe(true)
    const after = run(motion, 3.5, { pointer: POINTER })
    expect(after.every((f) => f.summon === "holding")).toBe(true)
    const later = run(motion, 1, { pointer: POINTER })
    expect(later.at(-1)!.summon).not.toBe("holding")
  })

  it("peeks if the cursor then holds it, without moving", () => {
    const motion = warm()
    motion.summon()
    const landed = run(motion, 2, { pointer: POINTER }).at(-1)!
    const frames = run(motion, 1, { pointer: POINTER, held: true })
    expect(frames.at(-1)!.peek).toBeGreaterThan(0.97)
    expect(dist(pos(frames.at(-1)!), pos(landed))).toBeLessThan(0.01)
  })

  it("resumes wandering from where it is: no jump back to the old track, then back on the path", () => {
    const motion = warm()
    motion.summon()
    run(motion, 2, { pointer: POINTER })
    const frames = run(motion, 4 + 12, { pointer: POINTER })
    const resume = frames.findIndex((f) => f.summon !== "holding")
    expect(resume).toBeGreaterThan(0)
    let prev = pos(frames[resume - 1])
    let maxStep = 0
    for (const f of frames.slice(resume)) {
      maxStep = Math.max(maxStep, dist(pos(f), prev))
      prev = pos(f)
    }
    // A wander is a few px/s; the blend back may speed up but never snaps (well under a frame of the flight).
    expect(maxStep).toBeLessThan(6)
    expect(frames.at(-1)!.summon).toBe("idle")
    expect(frames.at(-1)!.x).toBeGreaterThan(0)
  })

  it("starts the blend back from rest: the first frames barely move", () => {
    const motion = warm()
    motion.summon()
    run(motion, 2, { pointer: POINTER })
    const frames = run(motion, 4.5, { pointer: POINTER })
    const resume = frames.findIndex((f) => f.summon !== "holding")
    expect(dist(pos(frames[resume + 2]), pos(frames[resume - 1]))).toBeLessThan(1)
  })

  it("can be summoned again while parked, from where it is", () => {
    const motion = warm()
    motion.summon()
    const first = run(motion, 2, { pointer: POINTER }).at(-1)!
    motion.summon()
    const other: Point = { x: 300, y: 650 }
    const frames = run(motion, 2.5, { pointer: other })
    expect(dist(pos(frames[0]), pos(first))).toBeLessThan(2)
    expect(dist(pos(frames.at(-1)!), landingFor(other))).toBeLessThan(0.01)
  })

  it("can be summoned again while it is blending back", () => {
    const motion = warm()
    motion.summon()
    run(motion, 2, { pointer: POINTER })
    const mid = run(motion, 5, { pointer: POINTER }).at(-1)!
    expect(mid.summon).toBe("returning")
    motion.summon()
    const frames = run(motion, 2.5, { pointer: POINTER })
    expect(dist(pos(frames[0]), pos(mid))).toBeLessThan(6)
    expect(dist(pos(frames.at(-1)!), landingFor(POINTER))).toBeLessThan(0.01)
  })

  it("lands in the middle of the screen when there is no pointer yet", () => {
    const motion = warm()
    motion.summon()
    const frames = run(motion, 2, { pointer: null })
    expect(dist(pos(frames.at(-1)!), landingFor({ x: W / 2, y: H / 2 }))).toBeLessThan(0.01)
  })

  it("lands clear of the keep-out boxes even with the cursor on one", () => {
    const motion = warm()
    motion.summon()
    const last = run(motion, 2, { pointer: { x: 400, y: 380 } }).at(-1)!
    for (const box of keepOut) expect(distanceToRect(pos(last), box)).toBeGreaterThanOrEqual(m.clearance - 0.5)
  })

  it("cancelling mid-flight stops it where it is, with no jump, and it wanders on from there", () => {
    const motion = warm()
    motion.summon()
    const mid = run(motion, 0.6, { pointer: POINTER }).at(-1)!
    motion.cancelSummon()
    const next = run(motion, 1 / 60, { pointer: POINTER, held: true })[0]
    expect(dist(pos(next), pos(mid))).toBeLessThan(0.5)
    const later = run(motion, 3, { pointer: POINTER, held: true }).at(-1)!
    expect(dist(pos(later), pos(mid))).toBeLessThan(0.5)
    const free = run(motion, 20, { pointer: POINTER })
    expect(free.at(-1)!.summon).toBe("idle")
  })

  it("does not leave a stale summoned state after being cancelled and parked for a trip", () => {
    const motion = warm()
    motion.summon()
    run(motion, 2, { pointer: POINTER })
    motion.cancelSummon()
    run(motion, 3, { parked: true })
    const frames = run(motion, 15, {})
    expect(frames.at(-1)!.summon).toBe("idle")
  })

  describe("under reduced motion", () => {
    it("does not fly: it fades out, appears at the landing and fades back in", () => {
      const motion = warm(true)
      const start = pos(run(motion, 1 / 60)[0])
      const target = landingFor(POINTER)
      motion.summon()
      const frames = run(motion, 2, { pointer: POINTER })
      for (const f of frames) expect(Math.min(dist(pos(f), start), dist(pos(f), target))).toBeLessThan(5)
      expect(Math.min(...frames.map((f) => f.energy))).toBeLessThan(0.02)
      expect(frames.at(-1)!.energy).toBeGreaterThan(0.8)
      expect(dist(pos(frames.at(-1)!), target)).toBeLessThan(0.01)
      expect(frames.at(-1)!.summon).toBe("holding")
    })

    it("moves only while it is invisible", () => {
      const motion = warm(true)
      motion.summon()
      const frames = run(motion, 2, { pointer: POINTER })
      for (let i = 1; i < frames.length; i++) {
        if (dist(pos(frames[i]), pos(frames[i - 1])) > 5) {
          expect(frames[i].energy).toBeLessThan(0.02)
          expect(frames[i - 1].energy).toBeLessThan(0.02)
        }
      }
    })

    it("goes back to its track with a fade too, not a glide", () => {
      const motion = warm(true)
      motion.summon()
      run(motion, 2, { pointer: POINTER })
      const frames = run(motion, 6, { pointer: POINTER })
      expect(frames.at(-1)!.summon).toBe("idle")
      for (let i = 1; i < frames.length; i++) {
        if (dist(pos(frames[i]), pos(frames[i - 1])) > 5) expect(frames[i].energy).toBeLessThan(0.02)
      }
      expect(frames.at(-1)!.energy).toBeGreaterThan(0.8)
    })
  })
})
