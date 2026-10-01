import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import { MemoryPoints } from "./memory-points"

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
    render(<MemoryPoints memories={trip} reduced={false} onOpen={() => {}} />)
    const list = screen.getByRole("list", { name: "Recuerdos" })
    expect(Array.from(list.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Uno, 12 de marzo de 2024",
      "Dos, 12 de marzo de 2024",
      "Tres, 13 de marzo de 2024",
      "Lejos, 2 de noviembre de 2019",
    ])
  })

  it("draws the links on a canvas behind the orbs that no assistive tech or pointer can reach", () => {
    const { container } = render(<MemoryPoints memories={trip} reduced={false} onOpen={() => {}} />)
    const canvas = container.querySelector("canvas[data-edges]") as HTMLCanvasElement
    expect(canvas.getAttribute("aria-hidden")).toBe("true")
    expect(canvas.className).toContain("pointer-events-none")
    expect(canvas.compareDocumentPosition(screen.getByRole("list")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelectorAll("button")).toHaveLength(4)
    expect(screen.queryAllByRole("button", { hidden: false })).toHaveLength(4)
  })

  it("places every orb at its seeded spot on the first paint, so nothing jumps on mount", () => {
    render(<MemoryPoints memories={trip} reduced={false} onOpen={() => {}} />)
    for (const b of screen.getAllByRole("button")) expect(at(b as HTMLElement)).not.toBeNull()
  })
})

describe("MemoryPoints in motion", () => {
  it("runs one rAF loop, moves the orbs by transform and gathers the linked ones", () => {
    render(<MemoryPoints memories={trip} reduced={false} onOpen={() => {}} />)
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
    render(<MemoryPoints memories={trip} reduced={false} onOpen={() => {}} />)
    const before = screen.getAllByRole("button")
    play(30)
    expect(screen.getAllByRole("button")).toEqual(before)
  })

  it("draws edges for the linked orbs and none for the stranger", () => {
    render(<MemoryPoints memories={trip} reduced={false} onOpen={() => {}} />)
    play(2)
    // a-b, a-c, b-c are linked; "Lejos" is not.
    expect(context.strokes).toBeGreaterThan(0)
    expect(context.strokes).toBeLessThanOrEqual(3 * 2 + 3)
  })

  it("pauses while the tab is hidden and resumes when it is back", () => {
    render(<MemoryPoints memories={trip} reduced={false} onOpen={() => {}} />)
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
    const { unmount } = render(<MemoryPoints memories={trip} reduced={false} onOpen={() => {}} />)
    const pending = frames.length
    unmount()
    expect(cancelled).toBeGreaterThanOrEqual(pending)
  })

  it("holds a hovered orb still, lights its links and dims the rest, then lets go", () => {
    render(<MemoryPoints memories={trip} reduced={false} onOpen={() => {}} />)
    play(60)
    const a = orb(/Uno/)
    fireEvent.pointerOver(a, { pointerType: "mouse" })
    expect(a.getAttribute("data-link")).toBe("self")
    expect(orb(/Dos/).getAttribute("data-link")).toBe("near")
    expect(orb(/Tres/).getAttribute("data-link")).toBe("near")
    expect(orb(/Lejos/).getAttribute("data-link")).toBe("far")

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
    render(<MemoryPoints memories={trip} reduced={false} onOpen={() => {}} />)
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
    render(<MemoryPoints memories={trip} reduced={false} onOpen={() => {}} />)
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

  it("opens the viewer from where the orb is now", () => {
    const onOpen = vi.fn()
    render(<MemoryPoints memories={trip} reduced={false} onOpen={onOpen} />)
    play(180)
    const a = orb(/Uno/)
    fireEvent.click(a)
    const [id, origin] = onOpen.mock.calls[0]
    expect(id).toBe("a")
    const now = at(a)!
    expect(Math.abs(origin.x - now.x)).toBeLessThan(0.1)
    expect(Math.abs(origin.y - now.y)).toBeLessThan(0.1)
  })

  it("keeps the others where they are when a memory is added", () => {
    const { rerender } = render(<MemoryPoints memories={trip} reduced={false} onOpen={() => {}} />)
    play(120)
    const a = orb(/Uno/)
    const before = at(a)!
    rerender(<MemoryPoints memories={[...trip, view("n", "Nuevo", { happenedOn: "2023-05-05" })]} reduced={false} onOpen={() => {}} />)
    const after = at(orb(/Uno/))!
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(1)
    expect(screen.getAllByRole("button")).toHaveLength(5)
  })
})

describe("MemoryPoints with reduced motion", () => {
  it("settles once, synchronously, draws the links and never schedules a frame", () => {
    const { container } = render(<MemoryPoints memories={trip} reduced onOpen={() => {}} />)
    expect(frames).toHaveLength(0)
    expect(context.strokes).toBeGreaterThan(0)
    for (const b of Array.from(container.querySelectorAll("button"))) expect(at(b)).not.toBeNull()
  })

  it("renders the settled layout: linked memories end up closer than the stranger", () => {
    render(<MemoryPoints memories={trip} reduced onOpen={() => {}} />)
    const near = gap(orb(/Uno/), orb(/Dos/))
    expect(near).toBeLessThan(gap(orb(/Uno/), orb(/Lejos/)))
    expect(near).toBeLessThan(gap(orb(/Dos/), orb(/Lejos/)))
  })

  it("still answers hover and focus, without a loop", () => {
    render(<MemoryPoints memories={trip} reduced onOpen={() => {}} />)
    const a = orb(/Uno/)
    fireEvent.pointerOver(a, { pointerType: "mouse" })
    expect(a.getAttribute("data-link")).toBe("self")
    expect(orb(/Lejos/).getAttribute("data-link")).toBe("far")
    expect(frames).toHaveLength(0)
  })
})
