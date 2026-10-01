import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import { worldBounds, type Camera } from "./camera"
import { createCameraController, type CameraController } from "./camera-controller"
import { MemoryPoints, type PointsHandle } from "./memory-points"
import { OPEN_ZOOM } from "./glass-layout"

const view = (id: string, caption: string, over: Partial<MemoryView> = {}): MemoryView => ({
  id,
  caption,
  happenedOn: "2024-03-12",
  status: "approved",
  width: 800,
  height: 600,
  kind: "image",
  takenAt: null,
  dominantColor: null,
  place: null,
  orbColor: "#8ab4ff",
  thumbUrl: `https://res.cloudinary.com/demo/t/${id}`,
  fullUrl: `https://res.cloudinary.com/demo/f/${id}`,
  audio: null,
  ...over,
})

// Three days of one trip (linked), a fourth memory years away (linked to nothing).
const trip = [
  view("a", "Uno", { happenedOn: "2024-03-12" }),
  view("b", "Dos", { happenedOn: "2024-03-12" }),
  view("c", "Tres", { happenedOn: "2024-03-13" }),
  view("z", "Lejos", { happenedOn: "2019-11-02" }),
]

const PAD = { top: 96, right: 28, bottom: 168, left: 28 }
let controller: CameraController
let handle: { current: PointsHandle | null }

/** Mounts the orbs with a camera and a world, the way the place builds them. */
function mount(
  memories: readonly MemoryView[],
  reduced = false,
  onOpen: (id: string, world: { x: number; y: number }) => void = () => {},
  extra: { approachId?: string | null } = {},
) {
  const aspect = window.innerWidth / window.innerHeight
  controller = createCameraController({
    reduced,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    bounds: worldBounds(memories.length, aspect),
    pad: PAD,
  })
  handle = { current: null }
  const props = (list: readonly MemoryView[], approachId: string | null) => ({
    memories: list,
    bounds: worldBounds(list.length, aspect),
    controller,
    reduced,
    approachId,
    onOpen,
    ref: handle,
  })
  const utils = render(<MemoryPoints {...props(memories, extra.approachId ?? null)} />)
  return {
    ...utils,
    again: (list: readonly MemoryView[], next: { approachId?: string | null } = {}) =>
      utils.rerender(<MemoryPoints {...props(list, next.approachId ?? null)} />),
  }
}

let frames: Array<(now: number) => void> = []
let cancelled = 0
let context: Record<string, unknown> & { strokes: number }

beforeEach(() => {
  frames = []
  cancelled = 0
  vi.stubGlobal("matchMedia", undefined)
  vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => frames.push(cb))
  vi.stubGlobal("cancelAnimationFrame", () => {
    cancelled++
  })
  context = {
    strokes: 0,
    clearRect: () => {},
    setTransform: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {
      context.strokes++
    },
    createLinearGradient: () => ({ addColorStop: () => {} }),
  }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => context) as never)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Plays `count` frames of `ms` each, starting from the pending frame callback. */
function play(count: number, ms = 16.667, from = 1000) {
  for (let i = 0; i < count; i++) {
    const next = frames.pop()
    if (!next) return
    frames = []
    act(() => next(from + (i + 1) * ms))
  }
}

const at = (el: HTMLElement) => {
  const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(el.parentElement?.style.transform ?? "")
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null
}
const gap = (a: HTMLElement, b: HTMLElement) => {
  const p = at(a)!
  const q = at(b)!
  return Math.hypot(p.x - q.x, p.y - q.y)
}
const orb = (name: RegExp) => screen.getByRole("button", { name }) as HTMLElement

describe("MemoryPoints markup", () => {
  it("keeps one real button per memory, in list (date) order, named by caption and date", () => {
    mount(trip)
    const list = screen.getByRole("list", { name: "Recuerdos" })
    expect(Array.from(list.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Uno, 12 de marzo de 2024",
      "Dos, 12 de marzo de 2024",
      "Tres, 13 de marzo de 2024",
      "Lejos, 2 de noviembre de 2019",
    ])
  })

  it("draws the links on a canvas behind the orbs that no assistive tech or pointer can reach", () => {
    const { container } = mount(trip)
    const canvas = container.querySelector("canvas[data-edges]") as HTMLCanvasElement
    expect(canvas.getAttribute("aria-hidden")).toBe("true")
    expect(canvas.className).toContain("pointer-events-none")
    expect(canvas.compareDocumentPosition(screen.getByRole("list")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelectorAll("button")).toHaveLength(4)
    expect(screen.queryAllByRole("button", { hidden: false })).toHaveLength(4)
  })

  it("places every orb at its seeded spot on the first paint, so nothing jumps on mount", () => {
    mount(trip)
    for (const b of screen.getAllByRole("button")) expect(at(b as HTMLElement)).not.toBeNull()
  })
})

describe("MemoryPoints in motion", () => {
  it("runs one rAF loop, moves the orbs by transform and gathers the linked ones", () => {
    mount(trip)
    expect(frames.length).toBe(1)
    const [a, b] = [orb(/Uno/), orb(/Dos/)]
    const before = at(a)!
    const gapBefore = gap(a, b)
    play(240)
    const after = at(a)!
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0)
    expect(frames.length).toBe(1)
    expect(gap(a, b)).toBeLessThan(gapBefore)
  })

  it("never writes React state per frame: the buttons keep the very same elements", () => {
    mount(trip)
    const before = screen.getAllByRole("button")
    play(30)
    expect(screen.getAllByRole("button")).toEqual(before)
  })

  it("draws edges for the linked orbs and none for the stranger", () => {
    mount(trip)
    play(2)
    // a-b, a-c, b-c are linked; "Lejos" is not.
    expect(context.strokes).toBeGreaterThan(0)
    expect(context.strokes).toBeLessThanOrEqual(3 * 2 + 3)
  })

  it("pauses while the tab is hidden and resumes when it is back", () => {
    mount(trip)
    play(1)
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true)
    document.dispatchEvent(new Event("visibilitychange"))
    expect(cancelled).toBeGreaterThan(0)
    frames = []
    hidden.mockReturnValue(false)
    document.dispatchEvent(new Event("visibilitychange"))
    expect(frames.length).toBe(1)
  })

  it("stops its loop when it unmounts", () => {
    const { unmount } = mount(trip)
    const pending = frames.length
    unmount()
    expect(cancelled).toBeGreaterThanOrEqual(pending)
  })

  it("holds a hovered orb still, lights its links and dims the rest, then lets go", () => {
    mount(trip)
    play(60)
    const a = orb(/Uno/)
    fireEvent.pointerOver(a, { pointerType: "mouse" })
    expect(a.getAttribute("data-link")).toBe("self")
    expect(orb(/Dos/).getAttribute("data-link")).toBe("near")
    expect(orb(/Tres/).getAttribute("data-link")).toBe("near")
    expect(orb(/Lejos/).getAttribute("data-link")).toBe("far")

    // The first steps after the hold zero the orb's velocity; from then on it does not move at all.
    play(3)
    const held = at(a)!
    const other = at(orb(/Lejos/))!
    play(120)
    expect(at(a)).toEqual(held)
    expect(at(orb(/Lejos/))).not.toEqual(other)

    fireEvent.pointerOut(a, { pointerType: "mouse", relatedTarget: document.body })
    for (const b of screen.getAllByRole("button")) expect(b.getAttribute("data-link")).toBe("idle")
    play(120)
    expect(at(a)).not.toEqual(held)
  })

  it("holds the orb that has keyboard focus too", () => {
    mount(trip)
    play(30)
    const b = orb(/Dos/)
    act(() => b.focus())
    expect(b.getAttribute("data-link")).toBe("self")
    const held = at(b)!
    play(90)
    expect(at(b)).toEqual(held)
    act(() => b.blur())
    expect(b.getAttribute("data-link")).toBe("idle")
  })

  it("holds an orb the pointer is about to be captured by, before it is over it", () => {
    mount(trip)
    play(30)
    const a = orb(/Uno/)
    const p = at(a)!
    fireEvent.pointerMove(window, { clientX: p.x + 40, clientY: p.y, pointerType: "mouse" })
    play(2)
    expect(a.getAttribute("data-link")).toBe("self")
    fireEvent.pointerMove(window, { clientX: p.x + 600, clientY: p.y, pointerType: "mouse" })
    play(2)
    expect(a.getAttribute("data-link")).toBe("idle")
  })

  it("hands over where the orb is in the world when it is opened", () => {
    const onOpen = vi.fn()
    mount(trip, false, onOpen)
    play(180)
    fireEvent.click(orb(/Uno/))
    const [id, world] = onOpen.mock.calls[0]
    expect(id).toBe("a")
    const now = handle.current!.worldOf("a")!
    expect(world.x).toBeCloseTo(now.x, 6)
    expect(world.y).toBeCloseTo(now.y, 6)
  })

  describe("a tap on overlapping orbs", () => {
    /** A click as a finger makes it: at a point, with a pointer type. */
    const tapAt = (target: Element, x: number, y: number, pointerType: string) => {
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y })
      Object.defineProperty(event, "pointerType", { value: pointerType })
      act(() => {
        target.dispatchEvent(event)
      })
    }
    /** Two orbs 12 px apart, so their 44 px hit areas overlap and "Dos" is the one on top. */
    const crowd = (onOpen: (id: string, world: { x: number; y: number }) => void) => {
      mount(trip, false, onOpen)
      play(5)
      const centers: Record<string, [number, number]> = { Uno: [100, 100], Dos: [112, 104], Tres: [400, 400], Lejos: [600, 600] }
      for (const [name, [x, y]] of Object.entries(centers)) {
        vi.spyOn(orb(new RegExp(name)), "getBoundingClientRect").mockReturnValue(
          new DOMRect(x - 22, y - 22, 44, 44),
        )
      }
    }

    it("opens the orb nearest the finger, not the one drawn on top", () => {
      const onOpen = vi.fn()
      crowd(onOpen)
      tapAt(orb(/Dos/), 99, 100, "touch")
      expect(onOpen).toHaveBeenCalledTimes(1)
      expect(onOpen.mock.calls[0][0]).toBe("a")
    })

    it("leaves a mouse click and a keyboard activation on the orb they hit", () => {
      const onOpen = vi.fn()
      crowd(onOpen)
      tapAt(orb(/Dos/), 99, 100, "mouse")
      tapAt(orb(/Dos/), 0, 0, "")
      expect(onOpen.mock.calls.map((c) => c[0])).toEqual(["b", "b"])
    })
  })

  it("keeps the others where they are when a memory is added", () => {
    const { again } = mount(trip)
    play(120)
    const a = orb(/Uno/)
    const before = at(a)!
    again([...trip, view("n", "Nuevo", { happenedOn: "2023-05-05" })])
    const after = at(orb(/Uno/))!
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(1)
    expect(screen.getAllByRole("button")).toHaveLength(5)
  })
})

describe("MemoryPoints with reduced motion", () => {
  it("settles once, synchronously, draws the links and never schedules a frame", () => {
    const { container } = mount(trip, true)
    expect(frames).toHaveLength(0)
    expect(context.strokes).toBeGreaterThan(0)
    for (const b of Array.from(container.querySelectorAll("button"))) expect(at(b)).not.toBeNull()
  })

  it("renders the settled layout: linked memories end up closer than the stranger", () => {
    mount(trip, true)
    const near = gap(orb(/Uno/), orb(/Dos/))
    expect(near).toBeLessThan(gap(orb(/Uno/), orb(/Lejos/)))
    expect(near).toBeLessThan(gap(orb(/Dos/), orb(/Lejos/)))
  })

  it("still answers hover and focus, without a loop", () => {
    mount(trip, true)
    const a = orb(/Uno/)
    fireEvent.pointerOver(a, { pointerType: "mouse" })
    expect(a.getAttribute("data-link")).toBe("self")
    expect(orb(/Lejos/).getAttribute("data-link")).toBe("far")
    expect(frames).toHaveLength(0)
  })
})

const screenOf = (el: HTMLElement) => at(el)!
const scaleOf = (el: HTMLElement) => Number(/scale\(([\d.]+)\)/.exec(el.parentElement?.style.transform ?? "")?.[1])

describe("MemoryPoints on the canvas", () => {
  it("fits the whole constellation inside the viewport on first entry", () => {
    mount(trip, true)
    for (const b of screen.getAllByRole("button")) {
      const p = screenOf(b as HTMLElement)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(window.innerWidth)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(window.innerHeight)
    }
  })

  it("keeps the orbs inside the world, whose bounds grow with the number of memories", () => {
    mount(trip, true)
    const bounds = worldBounds(trip.length, window.innerWidth / window.innerHeight)
    for (const m of trip) {
      const w = handle.current!.worldOf(m.id)!
      expect(w.x).toBeGreaterThanOrEqual(bounds.left)
      expect(w.x).toBeLessThanOrEqual(bounds.right)
      expect(w.y).toBeGreaterThanOrEqual(bounds.top)
      expect(w.y).toBeLessThanOrEqual(bounds.bottom)
    }
  })

  it("places the orbs through the camera: panning moves them, with no React state", () => {
    mount(trip, true)
    const a = orb(/Uno/)
    const before = screenOf(a)
    const before2 = screenOf(orb(/Dos/))
    const cam = controller.camera()
    controller.jump({ ...cam, x: cam.x + 100 })
    const after = screenOf(a)
    // The camera moved right by 100 world px: everything slides left by 100 * zoom.
    expect(before.x - after.x).toBeCloseTo(100 * cam.zoom, 1)
    expect(after.y).toBeCloseTo(before.y, 1)
    expect(before2.x - screenOf(orb(/Dos/)).x).toBeCloseTo(100 * cam.zoom, 1)
  })

  it("draws orbs bigger as the camera zooms in", () => {
    mount(trip, true)
    const a = orb(/Uno/)
    const far = scaleOf(a)
    controller.jump({ ...controller.camera(), zoom: 2 })
    expect(scaleOf(a)).toBeGreaterThan(far)
  })

  it("redraws the links through the camera too, in the same frame as the orbs", () => {
    mount(trip)
    play(2)
    const strokes = context.strokes
    controller.jump({ ...controller.camera(), x: controller.camera().x + 40 })
    play(2)
    expect(context.strokes).toBeGreaterThan(strokes)
  })

  it("advances the camera from the loop, so a flight needs no loop of its own", () => {
    mount(trip)
    const target: Camera = { x: 900, y: 500, zoom: 2 }
    controller.flyTo(target)
    play(40, 50)
    expect(controller.camera()).toEqual(target)
  })

  it("does not reseed the orbs when the window is resized", () => {
    mount(trip, true)
    const before = handle.current!.worldOf("a")!
    const width = window.innerWidth
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 })
    act(() => {
      window.dispatchEvent(new Event("resize"))
    })
    const after = handle.current!.worldOf("a")!
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
    expect(controller.viewport().width).toBe(600)
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width })
  })

  it("brings an orb that takes keyboard focus into view when it is off screen", () => {
    mount(trip, true)
    const far = handle.current!.worldOf("z")!
    controller.jump({ x: far.x + 4000, y: far.y, zoom: 1 })
    act(() => orb(/Lejos/).focus())
    for (let i = 0; i < 40; i++) controller.step(1 / 30)
    const cam = controller.camera()
    expect(Math.abs(cam.x - far.x)).toBeLessThan(2)
  })
})

describe("MemoryPoints approach", () => {
  it("holds the approached orb still while the others keep moving", () => {
    const { again } = mount(trip)
    play(30)
    again(trip, { approachId: "a" })
    const a = orb(/Uno/)
    expect(a.getAttribute("data-link")).toBe("self")
    const held = handle.current!.worldOf("a")!
    const other = handle.current!.worldOf("z")!
    play(150)
    expect(handle.current!.worldOf("a")).toEqual(held)
    expect(handle.current!.worldOf("z")).not.toEqual(other)
  })

  it("lets it go again when the approach ends", () => {
    const { again } = mount(trip)
    play(10)
    again(trip, { approachId: "a" })
    again(trip, { approachId: null })
    expect(orb(/Uno/).getAttribute("data-link")).toBe("idle")
  })

  it("grows the orb toward the glass as the camera comes in, and shows its photo", () => {
    const { again } = mount(trip, true)
    again(trip, { approachId: "a" })
    const a = orb(/Uno/)
    const small = scaleOf(a)
    const world = handle.current!.worldOf("a")!
    controller.jump({ x: world.x, y: world.y, zoom: OPEN_ZOOM })
    expect(scaleOf(a)).toBeGreaterThan(small * 3)
    expect(a.getAttribute("data-focus")).toBe("true")
    // The orb stops breathing as it fills the screen (the breath would be scaled up with it).
    expect(Number(a.style.getPropertyValue("--focus"))).toBeCloseTo(1, 2)
    controller.jump({ ...controller.camera(), zoom: 0.5 })
    expect(a.hasAttribute("data-focus")).toBe(false)
    expect(Number(a.style.getPropertyValue("--focus"))).toBe(0)
  })
})

describe("MemoryPoints with and without a photo", () => {
  const voice = view("v", "Mamá cantando", {
    thumbUrl: null,
    fullUrl: null,
    width: null,
    height: null,
    audio: { url: "https://res.cloudinary.com/demo/video/v.mp3", durationMs: 4000 },
  })

  it("shows an audio-only memory as an orb with no photo, ready at once and marked as a voice", () => {
    const { container } = mount([voice, view("a", "Foto")], true)
    const b = orb(/Mamá cantando/)
    expect(b.querySelector("img")).toBeNull()
    expect(b.getAttribute("data-ready")).toBe("true")
    expect(b.getAttribute("data-voice")).toBe("true")
    expect(orb(/Foto/).getAttribute("data-voice")).toBe("false")
    expect(orb(/Foto/).getAttribute("data-ready")).toBe("false")
    expect(container.querySelectorAll("img")).toHaveLength(1)
  })

  it("marks a photo with a voice as a voice too", () => {
    mount([view("p", "Con voz", { audio: voice.audio })], true)
    expect(orb(/Con voz/).getAttribute("data-voice")).toBe("true")
  })
})
