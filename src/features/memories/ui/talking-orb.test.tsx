import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { rimColor } from "../orb-color"
import { TalkingOrb } from "./talking-orb"

let frames = new Map<number, (now: number) => void>()
let nextId = 1
let clock = 0

beforeEach(() => {
  frames = new Map()
  nextId = 1
  clock = 0
  vi.stubGlobal("matchMedia", undefined)
  vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => {
    const id = nextId++
    frames.set(id, cb)
    return id
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Runs the queued frames, `step` ms apart, `count` times. */
function advance(count: number, step = 16) {
  for (let i = 0; i < count; i++) {
    clock += step
    const pending = [...frames.entries()]
    frames.clear()
    act(() => {
      for (const [, cb] of pending) cb(clock)
    })
  }
}

const orb = () => screen.getByTestId("talking-orb")
const lvl = () => Number(orb().style.getPropertyValue("--lvl"))
const COLOR = "#ff9a3c"

describe("TalkingOrb", () => {
  it("is decoration: hidden from assistive technology, with the orb's color and its rim", () => {
    render(<TalkingOrb color={COLOR} level={() => 0} active={false} />)
    expect(orb().getAttribute("aria-hidden")).toBe("true")
    expect(orb().style.getPropertyValue("--pc")).toBe(COLOR)
    expect(orb().style.getPropertyValue("--rim")).toBe(rimColor(COLOR))
  })

  it("takes its size from the prop", () => {
    render(<TalkingOrb color={COLOR} level={() => 0} active={false} size={60} />)
    const core = orb().querySelector("[data-core]") as HTMLElement
    expect(core.style.width).toBe("60px")
    expect(core.style.height).toBe("60px")
  })

  it("reads the voice level every frame while it is active, and follows it up", () => {
    const level = vi.fn(() => 1)
    render(<TalkingOrb color={COLOR} level={level} active />)
    advance(20)
    expect(level).toHaveBeenCalled()
    expect(lvl()).toBeGreaterThan(0.8)
  })

  it("follows a quieter voice down, but slowly", () => {
    let value = 1
    render(<TalkingOrb color={COLOR} level={() => value} active />)
    advance(30)
    const loud = lvl()
    value = 0
    advance(3)
    expect(lvl()).toBeLessThan(loud)
    expect(lvl()).toBeGreaterThan(0.1)
  })

  it("does not read the level while it is off, and settles to rest and stops asking for frames", () => {
    const level = vi.fn(() => 1)
    const { rerender } = render(<TalkingOrb color={COLOR} level={level} active />)
    advance(20)
    level.mockClear()
    rerender(<TalkingOrb color={COLOR} level={level} active={false} />)
    advance(120)
    expect(level).not.toHaveBeenCalled()
    expect(lvl()).toBeLessThan(0.01)
    expect(frames.size).toBe(0)
  })

  it("never asks for a frame when it starts off", () => {
    render(<TalkingOrb color={COLOR} level={() => 1} active={false} />)
    expect(frames.size).toBe(0)
  })

  it("ripples outward with the voice: two rings, each showing the level from a little earlier", () => {
    render(<TalkingOrb color={COLOR} level={() => 1} active />)
    expect(orb().querySelectorAll("[data-ripple]")).toHaveLength(2)
    advance(2)
    // Right after the voice begins the older ripples have heard less of it than the core.
    const first = Number(orb().style.getPropertyValue("--r1"))
    const second = Number(orb().style.getPropertyValue("--r2"))
    expect(second).toBeLessThanOrEqual(first)
    advance(60)
    expect(Number(orb().style.getPropertyValue("--r2"))).toBeGreaterThan(0.5)
  })

  it("pulses the core with the level", () => {
    render(<TalkingOrb color={COLOR} level={() => 1} active />)
    advance(30)
    const core = orb().querySelector("[data-core]") as HTMLElement
    expect(core.style.transform).toContain("var(--lvl)")
    expect(orb().getAttribute("data-reduced")).toBe("false")
  })

  it("under reduced motion only glows with the level: no ripples and no deformation", () => {
    render(<TalkingOrb color={COLOR} level={() => 1} active reducedMotion />)
    advance(30)
    expect(orb().getAttribute("data-reduced")).toBe("true")
    expect(orb().querySelectorAll("[data-ripple]")).toHaveLength(0)
    const core = orb().querySelector("[data-core]") as HTMLElement
    expect(core.style.transform).toBe("")
    expect(core.style.filter).toContain("var(--lvl)")
    expect(lvl()).toBeGreaterThan(0.5)
  })

  it("follows the visitor's reduced-motion preference when the prop is not given", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    render(<TalkingOrb color={COLOR} level={() => 0} active={false} />)
    expect(orb().getAttribute("data-reduced")).toBe("true")
  })

  it("cancels its animation frame on unmount", () => {
    const { unmount } = render(<TalkingOrb color={COLOR} level={() => 1} active />)
    expect(frames.size).toBe(1)
    unmount()
    expect(frames.size).toBe(0)
  })

  it("keeps a bad level from breaking it: NaN and out-of-range values stay within 0 to 1", () => {
    let value = Number.NaN
    render(<TalkingOrb color={COLOR} level={() => value} active />)
    advance(5)
    expect(lvl()).toBeGreaterThanOrEqual(0)
    value = 7
    advance(60)
    expect(lvl()).toBeLessThanOrEqual(1)
  })
})
