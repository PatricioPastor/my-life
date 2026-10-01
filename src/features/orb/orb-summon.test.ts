import { afterEach, describe, expect, it } from "vitest"
import { distanceToRect, type Rect } from "./orb-path"
import {
  LANDING_GAP,
  SUMMON_MAX_S,
  SUMMON_MIN_S,
  isSummonKeyEvent,
  summonBlocked,
  summonDuration,
  summonEase,
  stepFollow,
  summonLanding,
} from "./orb-summon"

describe("summonEase", () => {
  it("starts at 0 and ends exactly at 1, clamping outside the range", () => {
    expect(summonEase(0)).toBe(0)
    expect(summonEase(1)).toBe(1)
    expect(summonEase(-3)).toBe(0)
    expect(summonEase(7)).toBe(1)
  })

  it("is monotonic and never overshoots", () => {
    let prev = 0
    for (let i = 0; i <= 1000; i++) {
      const v = summonEase(i / 1000)
      expect(v).toBeGreaterThanOrEqual(prev)
      expect(v).toBeLessThanOrEqual(1)
      prev = v
    }
  })

  it("starts reluctantly: under 15% of the way after a quarter of the time", () => {
    expect(summonEase(0.25)).toBeLessThan(0.15)
    expect(summonEase(0.1)).toBeLessThan(0.02)
  })

  it("then approaches fast: most of the distance is covered between 30% and 70% of the time", () => {
    expect(summonEase(0.7) - summonEase(0.3)).toBeGreaterThan(0.6)
  })

  it("settles softly: the last 15% of the time covers only a sliver", () => {
    expect(1 - summonEase(0.85)).toBeLessThan(0.08)
    expect(summonEase(0.999)).toBeGreaterThan(0.999)
  })

  it("has no speed spike at the end: the slope shrinks to zero", () => {
    const slope = (u: number) => (summonEase(u + 0.001) - summonEase(u)) / 0.001
    expect(slope(0.99)).toBeLessThan(slope(0.9))
    expect(slope(0.999)).toBeLessThan(0.05)
  })
})

describe("summonDuration", () => {
  it("stays within about 0.9 to 1.2 seconds", () => {
    for (const d of [0, 50, 300, 800, 1500, 5000]) {
      const s = summonDuration(d)
      expect(s).toBeGreaterThanOrEqual(SUMMON_MIN_S)
      expect(s).toBeLessThanOrEqual(SUMMON_MAX_S)
    }
    expect(SUMMON_MIN_S).toBeCloseTo(0.9, 5)
    expect(SUMMON_MAX_S).toBeCloseTo(1.2, 5)
  })

  it("grows gently with the distance and is never negative or NaN for bad input", () => {
    expect(summonDuration(1200)).toBeGreaterThan(summonDuration(300))
    expect(summonDuration(300)).toBeGreaterThanOrEqual(summonDuration(0))
    expect(summonDuration(Number.NaN)).toBe(SUMMON_MIN_S)
    expect(summonDuration(-10)).toBe(SUMMON_MIN_S)
  })
})

describe("summonLanding", () => {
  const W = 1440
  const H = 900
  const base = { width: W, height: H, keepOut: [] as Rect[], radius: 44, clearance: 59, margin: 62 }

  it("lands next to the cursor, not under it: a radius plus the gap away", () => {
    const at = summonLanding({ ...base, pointer: { x: 400, y: 300 } })
    expect(Math.hypot(at.x - 400, at.y - 300)).toBeCloseTo(44 + LANDING_GAP, 3)
  })

  it("sits on the side of the cursor that faces the middle of the screen", () => {
    const left = summonLanding({ ...base, pointer: { x: 400, y: 450 } })
    expect(left.x).toBeGreaterThan(400)
    const right = summonLanding({ ...base, pointer: { x: 1100, y: 450 } })
    expect(right.x).toBeLessThan(1100)
    const top = summonLanding({ ...base, pointer: { x: 720, y: 200 } })
    expect(top.y).toBeGreaterThan(200)
  })

  it("still picks a side when the cursor is dead center", () => {
    const at = summonLanding({ ...base, pointer: { x: W / 2, y: H / 2 } })
    expect(Math.hypot(at.x - W / 2, at.y - H / 2)).toBeCloseTo(44 + LANDING_GAP, 3)
  })

  it("is clamped to the viewport margin when the cursor hugs an edge", () => {
    const corner = summonLanding({ ...base, pointer: { x: 2, y: 2 } })
    expect(corner.x).toBeGreaterThanOrEqual(base.margin)
    expect(corner.y).toBeGreaterThanOrEqual(base.margin)
    const far = summonLanding({ ...base, pointer: { x: W + 50, y: H + 50 } })
    expect(far.x).toBeLessThanOrEqual(W - base.margin)
    expect(far.y).toBeLessThanOrEqual(H - base.margin)
  })

  it("stays clear of the keep-out boxes, even with the cursor on top of one", () => {
    const keepOut: Rect[] = [
      { left: 0, top: 0, right: 240, bottom: 96 },
      { left: 600, top: 350, right: 900, bottom: 550 },
    ]
    for (const pointer of [
      { x: 100, y: 40 },
      { x: 720, y: 450 },
      { x: 620, y: 360 },
      { x: 300, y: 120 },
      { x: 905, y: 551 },
    ]) {
      const at = summonLanding({ ...base, keepOut, pointer })
      for (const box of keepOut) expect(distanceToRect(at, box)).toBeGreaterThanOrEqual(base.clearance - 0.5)
      expect(at.x).toBeGreaterThanOrEqual(base.margin - 0.5)
      expect(at.y).toBeGreaterThanOrEqual(base.margin - 0.5)
      expect(at.x).toBeLessThanOrEqual(W - base.margin + 0.5)
      expect(at.y).toBeLessThanOrEqual(H - base.margin + 0.5)
    }
  })

  it("is a continuous function of the cursor, so a live target never jumps", () => {
    const keepOut: Rect[] = [{ left: 600, top: 350, right: 900, bottom: 550 }]
    let prev = summonLanding({ ...base, keepOut, pointer: { x: 300, y: 250 } })
    for (let x = 301; x < 1200; x++) {
      const at = summonLanding({ ...base, keepOut, pointer: { x, y: 250 } })
      expect(Math.hypot(at.x - prev.x, at.y - prev.y)).toBeLessThan(40)
      prev = at
    }
  })
})

describe("isSummonKeyEvent", () => {
  const key = (over: Partial<Record<"key" | "ctrlKey" | "metaKey" | "altKey" | "repeat" | "isComposing", unknown>> = {}) =>
    ({ key: "r", ctrlKey: false, metaKey: false, altKey: false, repeat: false, isComposing: false, ...over }) as never

  it("accepts r and R", () => {
    expect(isSummonKeyEvent(key())).toBe(true)
    expect(isSummonKeyEvent(key({ key: "R" }))).toBe(true)
  })

  it("rejects other keys, modifier chords, held-down repeats and composition", () => {
    expect(isSummonKeyEvent(key({ key: "e" }))).toBe(false)
    expect(isSummonKeyEvent(key({ ctrlKey: true }))).toBe(false)
    expect(isSummonKeyEvent(key({ metaKey: true }))).toBe(false)
    expect(isSummonKeyEvent(key({ altKey: true }))).toBe(false)
    expect(isSummonKeyEvent(key({ repeat: true }))).toBe(false)
    expect(isSummonKeyEvent(key({ isComposing: true }))).toBe(false)
  })
})

describe("summonBlocked", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("is open on a plain page", () => {
    document.body.innerHTML = `<button>ok</button>`
    expect(summonBlocked(document)).toBe(false)
  })

  it("blocks while typing in an input, textarea, select or contenteditable", () => {
    for (const html of [
      `<input id="f" />`,
      `<textarea id="f"></textarea>`,
      `<select id="f"><option>a</option></select>`,
      `<div id="f" contenteditable="true" tabindex="0"></div>`,
    ]) {
      document.body.innerHTML = html
      ;(document.getElementById("f") as HTMLElement).focus()
      expect(document.activeElement?.id).toBe("f")
      expect(summonBlocked(document)).toBe(true)
    }
  })

  it("blocks while a modal, a dialog or the intro layer is open", () => {
    for (const html of [
      `<div role="dialog">x</div>`,
      `<div role="alertdialog">x</div>`,
      `<div aria-modal="true">x</div>`,
      `<dialog open>x</dialog>`,
      `<div data-blocks-shortcuts>x</div>`,
    ]) {
      document.body.innerHTML = html
      expect(summonBlocked(document)).toBe(true)
    }
  })
})

describe("stepFollow", () => {
  it("converges on the target without overshooting, from rest", () => {
    let s = { x: 0, v: 0 }
    for (let i = 0; i < 60 * 3; i++) {
      s = stepFollow(s, 100, 12, 1 / 60)
      expect(s.x).toBeLessThanOrEqual(100)
    }
    expect(s.x).toBeCloseTo(100, 1)
  })

  it("keeps its velocity when the target jumps: the velocity is continuous, never a kick", () => {
    let s = { x: 0, v: 0 }
    for (let i = 0; i < 30; i++) s = stepFollow(s, 100, 12, 1 / 60)
    const before = s
    const after = stepFollow(before, 500, 12, 1e-5)
    expect(Math.abs(after.v - before.v)).toBeLessThan(1)
    expect(Math.abs(after.x - before.x)).toBeLessThan(5)
  })

  it("is exact for any step, so a long hidden-tab gap does not blow up", () => {
    const s = stepFollow({ x: 0, v: 50 }, 100, 12, 30)
    expect(s.x).toBeCloseTo(100, 3)
    expect(Number.isFinite(s.v)).toBe(true)
  })
})
