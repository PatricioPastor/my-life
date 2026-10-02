import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screenToWorld, worldToScreen } from "./camera"
import { createCameraController, type CameraController } from "./camera-controller"

const vp = { width: 1000, height: 700 }
const bounds = { left: 0, top: 0, right: 2000, bottom: 1400 }
const pad = { top: 80, right: 24, bottom: 140, left: 24 }

let clock = 0
let stage: HTMLElement
let controller: CameraController
let detach: () => void

function setup(reduced = false) {
  stage = document.createElement("div")
  stage.innerHTML = `<ul><li><button data-memory-id="a">orb</button></li></ul><div data-hud><button>hud</button></div><div role="dialog"><p>dialog</p></div>`
  document.body.appendChild(stage)
  controller = createCameraController({ reduced, viewport: vp, bounds, pad, now: () => clock })
  controller.setWorld(bounds, { left: 200, top: 200, right: 1800, bottom: 1200 }, true)
  detach = controller.attach(stage)
}

beforeEach(() => {
  clock = 0
  vi.useFakeTimers()
})
afterEach(() => {
  detach?.()
  stage?.remove()
  vi.useRealTimers()
})

/** jsdom MouseEvent has no pointerId; the controller reads it from the event, so define it. */
function fire(type: string, el: Element, x: number, y: number, id = 1, extra: Record<string, unknown> = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra })
  Object.assign(event, { pointerId: id, pointerType: (extra.pointerType as string) ?? "mouse" })
  el.dispatchEvent(event)
  return event
}

describe("the first camera", () => {
  it("fits the content inside the padded viewport", () => {
    setup()
    const cam = controller.camera()
    expect(cam).toEqual(controller.home())
    const a = worldToScreen(cam, vp, { x: 200, y: 200 })
    const b = worldToScreen(cam, vp, { x: 1800, y: 1200 })
    expect(a.x).toBeGreaterThanOrEqual(pad.left - 1e-6)
    expect(b.y).toBeLessThanOrEqual(vp.height - pad.bottom + 1e-6)
  })
})

describe("drag and inertia", () => {
  it("pans with the pointer and tells its subscribers", () => {
    setup()
    const seen = vi.fn()
    controller.subscribe(seen)
    const before = controller.camera()
    fire("pointerdown", stage, 500, 300)
    fire("pointermove", stage, 540, 300)
    fire("pointermove", stage, 600, 320)
    expect(controller.camera().x).toBeLessThan(before.x)
    expect(controller.camera().y).toBeLessThan(before.y)
    expect(seen).toHaveBeenCalled()
  })

  it("does not move for a tiny wobble", () => {
    setup()
    const before = controller.camera()
    fire("pointerdown", stage, 500, 300)
    fire("pointermove", stage, 502, 301)
    fire("pointerup", stage, 502, 301)
    expect(controller.camera()).toEqual(before)
  })

  it("keeps gliding after a flick and comes to rest", () => {
    setup()
    fire("pointerdown", stage, 500, 300)
    for (let i = 1; i <= 6; i++) {
      clock += 16
      fire("pointermove", stage, 500 + i * 30, 300)
    }
    fire("pointerup", stage, 680, 300)
    const released = controller.camera()
    controller.step(1 / 60)
    const first = controller.camera().x
    expect(first).toBeLessThan(released.x)
    for (let i = 0; i < 300; i++) controller.step(1 / 60)
    const rest = controller.camera().x
    controller.step(1 / 60)
    expect(controller.camera().x).toBe(rest)
    expect(rest).toBeLessThan(first)
  })

  it("has no inertia under reduced motion", () => {
    setup(true)
    fire("pointerdown", stage, 500, 300)
    for (let i = 1; i <= 6; i++) {
      clock += 16
      fire("pointermove", stage, 500 + i * 30, 300)
    }
    fire("pointerup", stage, 680, 300)
    const released = controller.camera()
    for (let i = 0; i < 30; i++) controller.step(1 / 60)
    expect(controller.camera()).toEqual(released)
  })

  it("swallows the click that ends a drag, but not a plain tap", () => {
    setup()
    const orb = stage.querySelector("button[data-memory-id]")!
    const clicks = vi.fn()
    stage.parentElement!.addEventListener("click", clicks)
    fire("pointerdown", orb, 500, 300)
    fire("pointermove", stage, 560, 300)
    fire("pointerup", stage, 560, 300)
    orb.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    expect(clicks).not.toHaveBeenCalled()
    vi.runAllTimers()
    fire("pointerdown", orb, 500, 300)
    fire("pointerup", orb, 500, 300)
    orb.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    expect(clicks).toHaveBeenCalledTimes(1)
    stage.parentElement!.removeEventListener("click", clicks)
  })

  it("lets a press on the HUD or in a dialog go by", () => {
    setup()
    const before = controller.camera()
    for (const target of [stage.querySelector("[data-hud] button")!, stage.querySelector("[role=dialog] p")!]) {
      fire("pointerdown", target, 500, 300)
      fire("pointermove", target, 600, 300)
      fire("pointerup", target, 600, 300)
    }
    expect(controller.camera()).toEqual(before)
  })

  it("does nothing while it is disabled", () => {
    setup()
    controller.setEnabled(false)
    const before = controller.camera()
    fire("pointerdown", stage, 500, 300)
    fire("pointermove", stage, 600, 300)
    expect(controller.camera()).toEqual(before)
  })
})

describe("wheel and pinch", () => {
  it("zooms toward the pointer and prevents the page from scrolling", () => {
    setup()
    const at = { x: 800, y: 200 }
    const before = screenToWorld(controller.camera(), vp, at)
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -240, clientX: at.x, clientY: at.y })
    stage.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(controller.camera().zoom).toBeGreaterThan(controller.home().zoom)
    const after = screenToWorld(controller.camera(), vp, at)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })

  it("zooms with two fingers and keeps what is between them", () => {
    setup()
    const middle = screenToWorld(controller.camera(), vp, { x: 500, y: 350 })
    fire("pointerdown", stage, 400, 350, 1, { pointerType: "touch" })
    fire("pointerdown", stage, 600, 350, 2, { pointerType: "touch" })
    fire("pointermove", stage, 300, 350, 1, { pointerType: "touch" })
    fire("pointermove", stage, 700, 350, 2, { pointerType: "touch" })
    const cam = controller.camera()
    expect(cam.zoom).toBeGreaterThan(controller.home().zoom * 1.5)
    const at = screenToWorld(cam, vp, { x: 500, y: 350 })
    expect(at.x).toBeCloseTo(middle.x, 6)
  })

  it("never zooms past the range", () => {
    setup()
    for (let i = 0; i < 60; i++) stage.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -400, clientX: 500, clientY: 350 }))
    expect(controller.camera().zoom).toBe(3)
  })
})

describe("double tap", () => {
  it("zooms in toward the point", () => {
    setup()
    const before = controller.camera()
    fire("pointerdown", stage, 700, 300, 1, { pointerType: "touch" })
    fire("pointerup", stage, 700, 300, 1, { pointerType: "touch" })
    clock += 120
    fire("pointerdown", stage, 702, 301, 1, { pointerType: "touch" })
    fire("pointerup", stage, 702, 301, 1, { pointerType: "touch" })
    for (let i = 0; i < 60; i++) controller.step(1 / 60)
    expect(controller.camera().zoom).toBeGreaterThan(before.zoom * 1.5)
  })

  it("ignores a double tap on an orb, which is two activations", () => {
    setup()
    const orb = stage.querySelector("button[data-memory-id]")!
    const before = controller.camera()
    fire("pointerdown", orb, 700, 300, 1, { pointerType: "touch" })
    fire("pointerup", orb, 700, 300, 1, { pointerType: "touch" })
    clock += 100
    fire("pointerdown", orb, 700, 300, 1, { pointerType: "touch" })
    fire("pointerup", orb, 700, 300, 1, { pointerType: "touch" })
    for (let i = 0; i < 60; i++) controller.step(1 / 60)
    expect(controller.camera()).toEqual(before)
  })

  it("jumps straight there under reduced motion", () => {
    setup(true)
    const before = controller.camera()
    fire("pointerdown", stage, 700, 300, 1, { pointerType: "touch" })
    fire("pointerup", stage, 700, 300, 1, { pointerType: "touch" })
    clock += 120
    fire("pointerdown", stage, 700, 300, 1, { pointerType: "touch" })
    fire("pointerup", stage, 700, 300, 1, { pointerType: "touch" })
    expect(controller.camera().zoom).toBeGreaterThan(before.zoom * 1.5)
  })
})

describe("keyboard", () => {
  const press = (key: string, target: Element = stage, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(event)
    return event
  }
  const settle = () => {
    for (let i = 0; i < 90; i++) controller.step(1 / 60)
  }

  it("pans with the arrows", () => {
    setup()
    const before = controller.camera()
    const event = press("ArrowRight")
    expect(event.defaultPrevented).toBe(true)
    settle()
    expect(controller.camera().x).toBeGreaterThan(before.x)
    expect(controller.camera().y).toBeCloseTo(before.y, 6)
  })

  it("zooms with + and -, and fits everything with 0", () => {
    setup()
    const home = controller.home()
    press("+")
    settle()
    expect(controller.camera().zoom).toBeGreaterThan(home.zoom)
    press("-")
    press("-")
    settle()
    expect(controller.camera().zoom).toBeLessThan(home.zoom)
    press("0")
    for (let i = 0; i < 120; i++) controller.step(1 / 60)
    expect(controller.camera()).toEqual(home)
  })

  it("answers instantly under reduced motion", () => {
    setup(true)
    const before = controller.camera()
    press("ArrowLeft")
    expect(controller.camera().x).toBeLessThan(before.x)
  })

  it("leaves keys with a modifier, other keys and dialogs alone", () => {
    setup()
    const before = controller.camera()
    expect(press("ArrowRight", stage, { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(press("a").defaultPrevented).toBe(false)
    expect(press("ArrowRight", stage.querySelector("[role=dialog] p")!).defaultPrevented).toBe(false)
    settle()
    expect(controller.camera()).toEqual(before)
  })
})

describe("flights", () => {
  const target = { x: 900, y: 600, zoom: 2.4 }

  it("flies on the approach curve and lands exactly, calling back once", () => {
    setup()
    const done = vi.fn()
    controller.flyTo(target, { onDone: done })
    controller.step(0.05)
    const early = controller.camera()
    expect(early).not.toEqual(target)
    expect(done).not.toHaveBeenCalled()
    for (let i = 0; i < 120; i++) controller.step(1 / 60)
    expect(controller.camera()).toEqual(target)
    expect(done).toHaveBeenCalledTimes(1)
    controller.step(1 / 60)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it("takes between 0.9 and 1.4 seconds", () => {
    setup()
    const done = vi.fn()
    controller.flyTo(target, { onDone: done })
    for (let i = 0; i < 53; i++) controller.step(1 / 60)
    expect(done).not.toHaveBeenCalled()
    for (let i = 0; i < 40; i++) controller.step(1 / 60)
    expect(done).toHaveBeenCalled()
  })

  it("cuts under reduced motion: there at once, with the fade hook around it", () => {
    setup(true)
    const order: string[] = []
    controller.setCut((apply) => {
      order.push("out")
      apply()
      order.push("in")
    })
    const done = vi.fn(() => order.push("done"))
    controller.flyTo(target, { onDone: done })
    expect(controller.camera()).toEqual(target)
    expect(order).toEqual(["out", "done", "in"])
  })

  it("drops a flight that is replaced, without calling it back", () => {
    setup()
    const first = vi.fn()
    const second = vi.fn()
    controller.flyTo(target, { onDone: first })
    controller.step(0.2)
    controller.flyTo({ x: 100, y: 100, zoom: 1 }, { onDone: second })
    for (let i = 0; i < 120; i++) controller.step(1 / 60)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it("waits before it leaves when asked (the glass melts back into the orb first)", () => {
    setup()
    const start = controller.camera()
    const done = vi.fn()
    controller.flyTo(target, { delay: 0.2, onDone: done })
    controller.step(0.1)
    controller.step(0.09)
    expect(controller.camera()).toEqual(start)
    expect(controller.progress()).toBe(0)
    controller.step(0.05)
    expect(controller.camera()).not.toEqual(start)
    for (let i = 0; i < 120; i++) controller.step(1 / 60)
    expect(controller.camera()).toEqual(target)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it("tells how far the flight has come on its curve, and nothing at rest", () => {
    setup()
    expect(controller.progress()).toBeNull()
    controller.flyTo(target)
    expect(controller.progress()).toBe(0)
    controller.step(0.3)
    const early = controller.progress()!
    controller.step(0.3)
    const later = controller.progress()!
    expect(early).toBeGreaterThan(0)
    expect(later).toBeGreaterThan(early)
    expect(later).toBeLessThan(1)
    for (let i = 0; i < 120; i++) controller.step(1 / 60)
    expect(controller.progress()).toBeNull()
  })

  it("stops gestures from taking over a flight that is on its way", () => {
    setup()
    controller.setEnabled(false)
    controller.flyTo(target)
    controller.step(0.3)
    const mid = controller.camera()
    fire("pointerdown", stage, 500, 300)
    fire("pointermove", stage, 700, 300)
    expect(controller.camera()).toEqual(mid)
  })
})

describe("the edges of the world", () => {
  it("lets a drag go a little past the edge, and eases back when let go", () => {
    setup()
    controller.jump({ x: 1990, y: 700, zoom: 1 })
    fire("pointerdown", stage, 800, 300)
    for (let i = 1; i <= 20; i++) fire("pointermove", stage, 800 - i * 20, 300)
    const out = controller.camera().x
    expect(out).toBeGreaterThan(bounds.right)
    expect(out).toBeLessThanOrEqual(bounds.right + 160)
    fire("pointerup", stage, 400, 300)
    for (let i = 0; i < 240; i++) controller.step(1 / 60)
    expect(controller.camera().x).toBeCloseTo(bounds.right, 1)
  })

  it("never allows a zoom out below what fits a huge world", () => {
    setup()
    controller.setWorld({ left: 0, top: 0, right: 12000, bottom: 8000 }, { left: 0, top: 0, right: 12000, bottom: 8000 }, true)
    expect(controller.camera().zoom).toBeLessThan(0.35)
    for (let i = 0; i < 60; i++) stage.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 400, clientX: 500, clientY: 350 }))
    expect(controller.camera().zoom).toBeGreaterThan(0)
    expect(controller.camera().zoom).toBeLessThan(0.35)
  })
})

describe("resizing", () => {
  it("keeps the camera and refits the home to the new viewport", () => {
    setup()
    const cam = controller.camera()
    const homeBefore = controller.home()
    controller.setViewport({ width: 390, height: 844 })
    expect(controller.camera()).toEqual(cam)
    expect(controller.home()).not.toEqual(homeBefore)
    expect(controller.viewport()).toEqual({ width: 390, height: 844 })
  })
})
