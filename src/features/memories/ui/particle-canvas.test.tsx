import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MAX_PARTICLES } from "./orb-particles"
import { ParticleCanvas } from "./particle-canvas"

/** A 2D context that only counts what is drawn. */
function fakeContext() {
  const ctx = {
    fillStyle: "" as string,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  }
  return ctx
}

let ctx: ReturnType<typeof fakeContext>
let frames: Map<number, (now: number) => void>
let nextId = 1
let clock = 1000
const cancel = vi.fn()

const geometry = (over: Partial<{ dpr: number; diameter: number }> = {}) => ({
  dpr: over.dpr ?? 1,
  diameter: over.diameter ?? 400,
  center: { x: 720, y: 400 },
})

interface Props {
  level: () => number
  emitting: boolean
  active: boolean
  reduced: boolean
  color: string
  dpr: number
}

function mount(over: Partial<Props> = {}) {
  const props: Props = { level: () => 0.8, emitting: true, active: true, reduced: false, color: "#ff9a3c", dpr: 1, ...over }
  const view = (p: Props) => (
    <ParticleCanvas
      geometry={geometry({ dpr: p.dpr })}
      color={p.color}
      level={p.level}
      emitting={p.emitting}
      active={p.active}
      reduced={p.reduced}
    />
  )
  const utils = render(view(props))
  return { ...utils, again: (next: Partial<Props>) => utils.rerender(view({ ...props, ...next })) }
}

/** Runs `count` animation frames, 16 ms apart, each firing whatever was asked for. */
function runFrames(count: number) {
  for (let i = 0; i < count; i++) {
    clock += 16
    const batch = [...frames.values()]
    frames.clear()
    act(() => batch.forEach((cb) => cb(clock)))
  }
}

const hidden = (value: boolean) => Object.defineProperty(document, "hidden", { configurable: true, get: () => value })

beforeEach(() => {
  ctx = fakeContext()
  frames = new Map()
  nextId = 1
  clock = 1000
  cancel.mockClear()
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ctx) as never)
  vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => {
    const id = nextId++
    frames.set(id, cb)
    return id
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    cancel(id)
    frames.delete(id)
  })
})
afterEach(() => {
  cleanup()
  hidden(false)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const canvas = () => document.querySelector<HTMLCanvasElement>("[data-orb-particles]")

describe("ParticleCanvas layout", () => {
  it("is a canvas around the sphere, centered on it and bigger than it, that the screen reader and the pointer skip", () => {
    mount()
    const el = canvas()!
    const size = parseFloat(el.style.width)
    expect(size).toBeGreaterThan(400 * 2)
    expect(parseFloat(el.style.height)).toBe(size)
    expect(parseFloat(el.style.left) + size / 2).toBe(720)
    expect(parseFloat(el.style.top) + size / 2).toBe(400)
    expect(el.getAttribute("aria-hidden")).toBe("true")
    expect(el.className).toContain("pointer-events-none")
  })

  it("draws at the screen's density, but never above 2x", () => {
    mount({ dpr: 1 })
    const size = parseFloat(canvas()!.style.width)
    expect(canvas()!.width).toBe(Math.round(size))
    cleanup()
    mount({ dpr: 3 })
    expect(canvas()!.width).toBe(Math.round(parseFloat(canvas()!.style.width) * 2))
  })

  it("is not there at all under reduced motion, and asks for no frames", () => {
    mount({ reduced: true })
    expect(canvas()).toBeNull()
    expect(frames.size).toBe(0)
  })
})

describe("ParticleCanvas drawing", () => {
  it("throws particles off while the voice plays loudly", () => {
    mount()
    runFrames(40)
    expect(ctx.arc.mock.calls.length).toBeGreaterThan(40)
    expect(ctx.fill).toHaveBeenCalled()
  })

  it("tints them with the memory's orb color", () => {
    mount({ color: "#ff9a3c" })
    runFrames(10)
    expect(ctx.fillStyle).toBe("rgb(255, 154, 60)")
  })

  it("draws more of them for a louder voice", () => {
    const count = (level: number) => {
      cleanup()
      ctx = fakeContext()
      mount({ level: () => level })
      runFrames(60)
      return ctx.arc.mock.calls.length
    }
    expect(count(0.9)).toBeGreaterThan(count(0.25) * 1.5)
  })

  it("never draws more than the pool holds in a frame", () => {
    mount({ level: () => 1 })
    runFrames(400)
    const perFrame = ctx.clearRect.mock.calls.length
    expect(perFrame).toBeGreaterThan(0)
    expect(ctx.arc.mock.calls.length / perFrame).toBeLessThanOrEqual(MAX_PARTICLES)
  })

  it("reads the level on every frame", () => {
    const level = vi.fn(() => 0.5)
    mount({ level })
    runFrames(5)
    expect(level.mock.calls.length).toBeGreaterThanOrEqual(5)
  })

  it("throws nothing off for a voice that is not playing, and asks for no more frames", () => {
    mount({ emitting: false })
    runFrames(3)
    expect(ctx.arc).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
  })

  it("throws nothing off for a silent voice", () => {
    mount({ level: () => 0 })
    runFrames(30)
    expect(ctx.arc).not.toHaveBeenCalled()
  })

  it("lets the particles in flight fade out when it is paused, and then stops its loop", () => {
    const { again } = mount()
    runFrames(60)
    again({ emitting: false })
    ctx.arc.mockClear()
    runFrames(10)
    expect(ctx.arc).toHaveBeenCalled()
    runFrames(400)
    const drawn = ctx.arc.mock.calls.length
    runFrames(5)
    expect(ctx.arc.mock.calls.length).toBe(drawn)
    expect(frames.size).toBe(0)
  })

  it("wakes up again when the voice starts", () => {
    const { again } = mount({ emitting: false })
    runFrames(3)
    expect(frames.size).toBe(0)
    again({ emitting: true })
    runFrames(30)
    expect(ctx.arc).toHaveBeenCalled()
  })

  it("clears the canvas and stops when the glass closes", () => {
    const { again } = mount()
    runFrames(30)
    ctx.clearRect.mockClear()
    again({ active: false })
    expect(ctx.clearRect).toHaveBeenCalled()
    expect(frames.size).toBe(0)
  })

  it("starts from nothing after it was closed", () => {
    const { again } = mount()
    runFrames(30)
    again({ active: false })
    again({ active: true, emitting: false })
    ctx.arc.mockClear()
    runFrames(3)
    expect(ctx.arc).not.toHaveBeenCalled()
  })
})

describe("ParticleCanvas lifecycle", () => {
  it("does not run while the tab is hidden, and picks up again when it is shown", () => {
    hidden(true)
    mount()
    expect(frames.size).toBe(0)
    hidden(false)
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(frames.size).toBe(1)
    runFrames(20)
    expect(ctx.arc).toHaveBeenCalled()
  })

  it("stops asking for frames when the tab is hidden mid-way", () => {
    mount()
    runFrames(5)
    hidden(true)
    runFrames(1)
    expect(frames.size).toBe(0)
  })

  it("cancels its frame and lets go of the tab listener on unmount", () => {
    const remove = vi.spyOn(document, "removeEventListener")
    const { unmount } = mount()
    runFrames(3)
    unmount()
    expect(cancel).toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function))
    expect(frames.size).toBe(0)
  })

  it("does nothing, and does not throw, where a 2D context is not available", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => null) as never)
    expect(() => mount()).not.toThrow()
    expect(frames.size).toBe(0)
  })
})
