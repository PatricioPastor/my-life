import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import { worldBounds, type Camera } from "./camera"
import { createCameraController, type CameraController } from "./camera-controller"
import { MemoryPoints, approachAmount, inscribedAmount, type PointsHandle } from "./memory-points"
import { OPEN_ZOOM, lensGeometry } from "./glass-layout"
import { PHOTO_RUNGS, approachSizes } from "../photo-ladder"
import type { PhotoCache } from "./photo-cache"
import { orbScale, worldToScreen } from "./camera"
import type { Approach } from "./approach"

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
  viewCount: 0,
  relatedId: null,
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
  onOpen: (id: string) => void = () => {},
  extra: { approachId?: string | null; approachPhase?: Approach["phase"]; cache?: PhotoCache } = {},
) {
  const aspect = window.innerWidth / window.innerHeight
  controller = createCameraController({
    reduced,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    bounds: worldBounds(memories.length, aspect),
    pad: PAD,
  })
  handle = { current: null }
  const props = (list: readonly MemoryView[], approachId: string | null, approachPhase: Approach["phase"]) => ({
    memories: list,
    bounds: worldBounds(list.length, aspect),
    controller,
    reduced,
    approachId,
    approachPhase,
    onOpen,
    cache: extra.cache,
    ref: handle,
  })
  const phaseOf = (id: string | null | undefined, phase?: Approach["phase"]) => phase ?? (id ? "open" : "idle")
  const utils = render(<MemoryPoints {...props(memories, extra.approachId ?? null, phaseOf(extra.approachId, extra.approachPhase))} />)
  return {
    ...utils,
    again: (list: readonly MemoryView[], next: { approachId?: string | null; approachPhase?: Approach["phase"] } = {}) =>
      utils.rerender(<MemoryPoints {...props(list, next.approachId ?? null, phaseOf(next.approachId, next.approachPhase))} />),
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

  it("adds the time to an orb's name and its cursor line when the memory has one", () => {
    mount([view("a", "Uno", { happenedTime: "18:42" }), view("b", "Dos", { happenedTime: null })])
    expect(orb(/^Uno/).getAttribute("aria-label")).toBe("Uno, 12 de marzo de 2024 · 18:42")
    expect(orb(/^Uno/).getAttribute("data-cursor-context")).toBe("12 de marzo de 2024 · 18:42")
    expect(orb(/^Dos/).getAttribute("aria-label")).toBe("Dos, 12 de marzo de 2024")
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

  it("says which orb was opened", () => {
    const onOpen = vi.fn()
    mount(trip, false, onOpen)
    play(180)
    fireEvent.click(orb(/Uno/))
    expect(onOpen).toHaveBeenCalledWith("a")
  })

  it("pins the orb it is asked for exactly where it is, and it never drifts from there", () => {
    mount(trip)
    play(90)
    const pinned = handle.current!.pin("a")!
    // Drawn on that very point at once: no leftover drift from the frame before.
    play(1)
    const cam = controller.camera()
    const drawn = worldToScreen(cam, controller.viewport(), pinned)
    expect(at(orb(/Uno/))!.x).toBeCloseTo(drawn.x, 2)
    expect(at(orb(/Uno/))!.y).toBeCloseTo(drawn.y, 2)
    play(240)
    expect(handle.current!.worldOf("a")).toEqual(pinned)
    expect(handle.current!.pin("nope")).toBeNull()
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
    const crowd = (onOpen: (id: string) => void) => {
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

describe("MemoryPoints related memories", () => {
  const apart = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

  it("spawns a newly added memory next to the one it was contributed from, not at a random spot", () => {
    const { again } = mount(trip)
    play(30)
    const parent = handle.current!.worldOf("z")!
    again([...trip, view("n", "Nuevo", { happenedOn: "2026-10-01", status: "pending", relatedId: "z" })])
    const spawned = handle.current!.worldOf("n")!
    expect(apart(spawned, parent)).toBeLessThan(110)
  })

  it("does not move the memories that were already there when one is added", () => {
    const { again } = mount(trip)
    play(30)
    const before = handle.current!.worldOf("a")!
    again([...trip, view("n", "Nuevo", { happenedOn: "2026-10-01", relatedId: "z" })])
    const after = handle.current!.worldOf("a")!
    // Not reseeded: it carries on from where it was (a hair of drift is the simulation's own first step).
    expect(apart(after, before)).toBeLessThan(0.05)
  })

  it("gathers two related memories from years apart into one cluster", () => {
    mount([view("old", "Antes", { happenedOn: "2019-11-02" }), view("new", "Después", { happenedOn: "2026-10-01", relatedId: "old" })], true)
    expect(apart(handle.current!.worldOf("old")!, handle.current!.worldOf("new")!)).toBeLessThan(100)
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

  it("takes the orbs out of the magnetic cursor's reach while the camera flies to or from a memory", () => {
    const { again } = mount(trip)
    expect(orb(/Uno/).getAttribute("data-magnetic")).toBe("light")
    again(trip, { approachId: "a", approachPhase: "flying" })
    // The cursor would otherwise ride the growing disc with its label.
    for (const b of screen.getAllByRole("button")) expect(b.hasAttribute("data-magnetic")).toBe(false)
    again(trip, { approachId: "a", approachPhase: "leaving" })
    expect(orb(/Dos/).hasAttribute("data-magnetic")).toBe(false)
    again(trip, { approachId: null, approachPhase: "idle" })
    for (const b of screen.getAllByRole("button")) expect(b.getAttribute("data-magnetic")).toBe("light")
  })

  it("lets it go again when the approach ends", () => {
    const { again } = mount(trip)
    play(10)
    again(trip, { approachId: "a" })
    again(trip, { approachId: null })
    expect(orb(/Uno/).getAttribute("data-link")).toBe("idle")
  })

  it("marks the orb being approached, and stops its breath once the glass is open", () => {
    const { again } = mount(trip, true)
    again(trip, { approachId: "a", approachPhase: "open" })
    const a = orb(/Uno/)
    expect(a.getAttribute("data-focus")).toBe("true")
    // The orb stops breathing as it fills the screen (the breath would be scaled up with it).
    expect(Number(a.style.getPropertyValue("--focus"))).toBeCloseTo(1, 2)
    again(trip, { approachId: null, approachPhase: "idle" })
    expect(a.hasAttribute("data-focus")).toBe(false)
    expect(Number(a.style.getPropertyValue("--focus"))).toBe(0)
  })
})

/** A photo cache the test drives: what is decoded, and when something lands. */
function fakeCache(decoded: string[] = []) {
  const ready = new Set(decoded)
  const listeners = new Set<(url: string) => void>()
  const cache = {
    warm: vi.fn(),
    adopt: vi.fn(),
    isDecoded: (url: string) => ready.has(url),
    get: () => null,
    load: vi.fn(() => new Promise<HTMLImageElement>(() => {})),
    bitmap: vi.fn(() => new Promise<ImageBitmap>(() => {})),
    subscribe: (listener: (url: string) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const land = (url: string) =>
    act(() => {
      ready.add(url)
      for (const listener of [...listeners]) listener(url)
    })
  return { cache: cache as unknown as PhotoCache & typeof cache, land }
}

const withLadder = (m: MemoryView): MemoryView => ({
  ...m,
  photo: { sizes: PHOTO_RUNGS.map((width) => ({ width, url: `${m.id}-${width}` })) },
})
const ladderTrip = trip.map(withLadder)
const photoOf = (name: RegExp) => orb(name).querySelector("img")?.getAttribute("src")
const lens = () => lensGeometry({ width: window.innerWidth, height: window.innerHeight }, window.devicePixelRatio || 1)

describe("MemoryPoints photos at the size they are shown", () => {
  it("shows each orb's photo at the size it is drawn on this screen", () => {
    mount(ladderTrip, true, undefined, { cache: fakeCache().cache })
    // A 40 px orb at the fitted zoom on a 1x screen: the 96 px crop.
    expect(photoOf(/Uno/)).toBe("a-96")
  })

  it("fetches a bigger size once the camera zooms in, and keeps it when it zooms back out", () => {
    vi.stubGlobal("devicePixelRatio", 2)
    mount(ladderTrip, true, undefined, { cache: fakeCache().cache })
    act(() => controller.jump({ ...controller.camera(), zoom: 3 }))
    // 40 x orbScale(3) x 2 is about 154 device px: 192.
    expect(40 * orbScale(3) * 2).toBeGreaterThan(120)
    expect(photoOf(/Uno/)).toBe("a-192")
    act(() => controller.jump({ ...controller.camera(), zoom: 0.5 }))
    expect(photoOf(/Uno/)).toBe("a-192")
  })

  it("loads the orb photos with CORS and hands each one to the shared cache", () => {
    const { cache } = fakeCache()
    mount(ladderTrip, true, undefined, { cache })
    const img = orb(/Uno/).querySelector("img")!
    expect(img.crossOrigin).toBe("anonymous")
    fireEvent.load(img)
    expect(cache.adopt).toHaveBeenCalledWith("a-96", img)
  })

  it("warms the glass sizes as soon as the visitor shows intent: a hover, a focus or a finger down", () => {
    const { cache } = fakeCache()
    mount(ladderTrip, false, undefined, { cache })
    const sizesOf = (i: number) => approachSizes(ladderTrip[i].photo!.sizes, lens().diameter, lens().dpr)
    fireEvent.pointerOver(orb(/Uno/), { pointerType: "mouse" })
    expect(cache.warm).toHaveBeenLastCalledWith(sizesOf(0))
    act(() => orb(/Dos/).focus())
    expect(cache.warm).toHaveBeenLastCalledWith(sizesOf(1))
    fireEvent.pointerDown(orb(/Tres/), { pointerType: "touch" })
    expect(cache.warm).toHaveBeenLastCalledWith(sizesOf(2))
  })

  it("asks for nothing for a voice with no photo", () => {
    const { cache } = fakeCache()
    const voice = view("v", "Voz", { thumbUrl: null, fullUrl: null, width: null, height: null, audio: { url: "x", durationMs: 1 } })
    mount([voice], false, undefined, { cache })
    fireEvent.pointerOver(orb(/Voz/), { pointerType: "mouse" })
    expect(cache.warm).not.toHaveBeenCalled()
  })
})

describe("how far the approach disc has grown", () => {
  it("follows the flight in, sits on the sphere while open, and follows the flight home", () => {
    expect(approachAmount("idle", null, false)).toBe(0)
    expect(approachAmount("flying", 0, false)).toBe(0)
    expect(approachAmount("flying", 0.4, false)).toBe(0.4)
    expect(approachAmount("open", null, false)).toBe(1)
    // Waiting for the glass to melt back: still the sphere.
    expect(approachAmount("leaving", 0, false)).toBe(1)
    expect(approachAmount("leaving", 0.25, false)).toBe(0.75)
  })

  it("follows how close the next orb is to the sphere during a switch", () => {
    expect(approachAmount("switching", 0.3, false, 0.25)).toBe(0.25)
    expect(approachAmount("switching", null, true, 1)).toBe(1)
  })

  it("never pops when a flight has landed but the phase has not caught up yet", () => {
    expect(approachAmount("flying", null, false)).toBe(1)
    expect(approachAmount("leaving", null, false)).toBe(0)
  })

  it("does not grow before a cut under reduced motion: it is there once the world has faded", () => {
    expect(approachAmount("flying", null, true)).toBe(0)
    expect(approachAmount("leaving", null, true)).toBe(0)
    expect(approachAmount("open", null, true)).toBe(1)
  })
})

describe("the next orb sliding under the sphere", () => {
  const D = 558
  const base = 40

  it("stays its own size while it is clear of the sphere, and is the sphere once centered", () => {
    expect(inscribedAmount(D / 2 + 10, D, base)).toBe(0)
    expect(inscribedAmount(0, D, base)).toBe(1)
  })

  it("is always inside the sphere's rim on the way in, so it is never seen growing past it", () => {
    for (let x = 0; x <= D; x += 3) {
      const a = inscribedAmount(x, D, base)
      const size = base + (D - base) * a
      if (a > 0) expect(x + size / 2).toBeLessThanOrEqual(D / 2 + 1e-9)
    }
  })
})

describe("MemoryPoints approach disc", () => {
  const disc = () => document.querySelector<HTMLElement>("[data-focus-disc]")!
  const discImages = () => Array.from(disc().querySelectorAll("img")).map((img) => img.getAttribute("src"))

  /** The disc's place and scale, as written by the loop. */
  const discAt = () => {
    const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0\) scale\(([\d.]+)\)/.exec(disc().style.transform)!
    return { x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) }
  }

  it("grows the disc with the flight, from the orb's own size to the sphere's", () => {
    const { again } = mount(ladderTrip, false, undefined, { cache: fakeCache(["a-96"]).cache })
    play(30)
    const world = handle.current!.pin("a")!
    again(ladderTrip, { approachId: "a", approachPhase: "flying" })
    controller.flyTo({ x: world.x, y: world.y, zoom: OPEN_ZOOM })
    play(1)
    const { diameter } = lens()
    const startScale = discAt().scale
    expect(startScale * diameter).toBeCloseTo(40 * orbScale(controller.camera().zoom), 0)
    play(30)
    const progress = controller.progress()!
    const base = 40 * orbScale(controller.camera().zoom)
    expect(discAt().scale).toBeCloseTo((base + (diameter - base) * progress) / diameter, 3)
    play(120)
    again(ladderTrip, { approachId: "a", approachPhase: "open" })
    expect(discAt().scale).toBeCloseTo(1, 4)
  })

  it("shrinks it back with the flight home, to exactly the orb's size as the camera lands", () => {
    const { again } = mount(ladderTrip, false, undefined, { cache: fakeCache(["a-96"]).cache })
    play(30)
    const home = controller.camera()
    const world = handle.current!.pin("a")!
    controller.jump({ x: world.x, y: world.y, zoom: OPEN_ZOOM })
    again(ladderTrip, { approachId: "a", approachPhase: "open" })
    play(1)
    again(ladderTrip, { approachId: "a", approachPhase: "leaving" })
    controller.flyTo(home)
    play(2)
    expect(discAt().scale).toBeLessThan(1)
    play(200)
    expect(controller.progress()).toBeNull()
    const base = 40 * orbScale(home.zoom)
    expect(discAt().scale * lens().diameter).toBeCloseTo(base, 1)
  })

  it("puts the disc on the sphere exactly when the glass is open, while the orb itself keeps its size", () => {
    const { again } = mount(ladderTrip, true, undefined, { cache: fakeCache(["a-96"]).cache })
    const world = handle.current!.pin("a")!
    const { diameter } = lens()
    act(() => controller.jump({ x: world.x, y: world.y, zoom: OPEN_ZOOM }))
    again(ladderTrip, { approachId: "a", approachPhase: "open" })
    expect(disc().getAttribute("data-on")).toBe("true")
    expect(disc().style.width).toBe(`${diameter}px`)
    const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0\) scale\(([\d.]+)\)/.exec(disc().style.transform)!
    const center = at(orb(/Uno/))!
    expect(Number(m[3])).toBeCloseTo(1, 3)
    expect(Number(m[1]) + diameter / 2).toBeCloseTo(center.x, 1)
    expect(Number(m[2]) + diameter / 2).toBeCloseTo(center.y, 1)
    // The orb is never blown up itself: only the disc grows.
    expect(scaleOf(orb(/Uno/))).toBeCloseTo(orbScale(OPEN_ZOOM), 3)
    again(ladderTrip, { approachId: null, approachPhase: "idle" })
    expect(disc().getAttribute("data-on")).toBe("false")
  })

  it("shows the sharpest decoded size and fades a sharper one in over it when it lands", () => {
    vi.useFakeTimers()
    const { cache, land } = fakeCache(["a-96"])
    const { again } = mount(ladderTrip, true, undefined, { cache })
    again(ladderTrip, { approachId: "a" })
    expect(discImages()).toEqual(["a-96"])
    land("a-384")
    expect(discImages()).toEqual(["a-96", "a-384"])
    expect(disc().querySelectorAll("img")[1].hasAttribute("data-enter")).toBe(true)
    act(() => vi.advanceTimersByTime(400))
    expect(discImages()).toEqual(["a-384"])
    // A smaller size landing late never replaces a sharper one.
    land("a-192")
    expect(discImages()).toEqual(["a-384"])
    vi.useRealTimers()
  })

  it("is never blank: before any photo has landed it holds the orb's own light", () => {
    const { again } = mount(ladderTrip, true, undefined, { cache: fakeCache().cache })
    again(ladderTrip, { approachId: "a" })
    expect(discImages()).toEqual([])
    expect(disc().querySelector("[data-disc-light]")).not.toBeNull()
    expect(disc().style.getPropertyValue("--pc")).toBe("#8ab4ff")
  })

  it("warms the sizes the approach needs as soon as it starts", () => {
    const { cache } = fakeCache()
    const { again } = mount(ladderTrip, true, undefined, { cache })
    again(ladderTrip, { approachId: "b" })
    expect(cache.warm).toHaveBeenLastCalledWith(approachSizes(ladderTrip[1].photo!.sizes, lens().diameter, lens().dpr))
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
