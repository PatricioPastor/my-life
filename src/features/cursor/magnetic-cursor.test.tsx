import { readFileSync } from "node:fs"
import { join } from "node:path"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MagneticCursor, type CursorTarget } from "./magnetic-cursor"

let frames: FrameRequestCallback[] = []
let clock = 0
let pressScale = 1
let reducedQueries = 0

function mockMedia(fine: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => (q.includes("reduced-motion") && reducedQueries++, {
    matches: q.includes("pointer: fine") ? fine : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

beforeEach(() => {
  frames = []
  clock = 0
  pressScale = 1
  reducedQueries = 0
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal("cancelAnimationFrame", () => {})
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.dataset.cursorLabel === "Historias") {
      // The press feedback scales the button about its center, exactly like `.press:active`.
      const w = 48 * pressScale
      const l = 224 - w / 2
      return { left: l, top: l, width: w, height: w, right: l + w, bottom: l + w, x: l, y: l } as DOMRect
    }
    return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 } as DOMRect
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function runFrames(n: number) {
  act(() => {
    for (let i = 0; i < n; i++) {
      const batch = frames
      frames = []
      clock += 16
      for (const cb of batch) cb(clock)
    }
  })
}

function Stage({ onCapture, onActivate }: { onCapture: (t: CursorTarget | null) => void; onActivate?: () => void }) {
  const ref = useRef<HTMLElement>(null)
  return (
    <main ref={ref}>
      <button type="button" onClick={onActivate} data-magnetic="strong" data-cursor-id="stories" data-cursor-label="Historias" data-cursor-context="x">
        Historias
      </button>
      <input aria-label="campo" />
      <MagneticCursor stageRef={ref} onCapture={onCapture} />
    </main>
  )
}

describe("MagneticCursor", () => {
  it("does not mount for coarse pointers", () => {
    mockMedia(false)
    const { container } = render(<Stage onCapture={vi.fn()} />)
    expect(container.querySelector(".mc")).toBeNull()
    expect(container.querySelector("main")?.getAttribute("data-cursor")).toBeNull()
  })

  it("mounts for fine pointers and hides the native cursor on the stage only", () => {
    mockMedia(true)
    const { container } = render(<Stage onCapture={vi.fn()} />)
    expect(container.querySelector(".mc")).not.toBeNull()
    expect(container.querySelector("main")?.getAttribute("data-cursor")).toBe("on")
    expect(document.body.getAttribute("data-cursor")).toBeNull()
  })

  it("captures a star near the pointer, names it, and releases it when the pointer leaves", () => {
    mockMedia(true)
    const onCapture = vi.fn()
    const { container } = render(<Stage onCapture={onCapture} />)
    const button = container.querySelector("button")!
    fireEvent.pointerMove(button, { clientX: 224, clientY: 224, pointerType: "mouse" })
    runFrames(2)
    expect(onCapture).toHaveBeenLastCalledWith({ id: "stories", label: "Historias", context: "x" })
    expect(container.querySelector(".mc")?.getAttribute("data-state")).toBe("captured")
    expect(container.querySelector(".mc-tip span")?.textContent).toBe("Historias")
    expect(container.querySelector(".mc-key")?.hasAttribute("hidden")).toBe(false)

    fireEvent.pointerMove(container.querySelector("input")!, { clientX: 900, clientY: 700, pointerType: "mouse" })
    runFrames(2)
    expect(onCapture).toHaveBeenLastCalledWith(null)
    expect(container.querySelector(".mc")?.getAttribute("data-state")).toBe("free")
  })

  it("hides the reticle over a text field so the native caret stays usable", () => {
    mockMedia(true)
    const { container } = render(<Stage onCapture={vi.fn()} />)
    fireEvent.pointerMove(container.querySelector("input")!, { clientX: 10, clientY: 10, pointerType: "mouse" })
    runFrames(2)
    expect(container.querySelector(".mc")?.getAttribute("data-visible")).toBe("off")
  })

  it("ignores touch pointers", () => {
    mockMedia(true)
    const onCapture = vi.fn()
    const { container } = render(<Stage onCapture={onCapture} />)
    fireEvent.pointerMove(container.querySelector("button")!, { clientX: 224, clientY: 224, pointerType: "touch" })
    runFrames(2)
    expect(onCapture).not.toHaveBeenCalled()
  })

  it("restores the stage on unmount", () => {
    mockMedia(true)
    const { container, unmount } = render(<Stage onCapture={vi.fn()} />)
    const main = container.querySelector("main")!
    unmount()
    expect(main.getAttribute("data-cursor")).toBeNull()
  })

  describe("feel", () => {
    const frameOf = (c: HTMLElement) => c.querySelector<HTMLElement>(".mc-frame")!

    it("follows the pointer 1:1 in free movement (no spring lag)", () => {
      mockMedia(true)
      const { container } = render(<Stage onCapture={vi.fn()} />)
      const main = container.querySelector("main")!
      fireEvent.pointerMove(main, { clientX: 600, clientY: 500, pointerType: "mouse" })
      runFrames(1)
      expect(frameOf(container).style.transform).toBe("translate3d(589.0px, 489.0px, 0)")
      fireEvent.pointerMove(main, { clientX: 1300, clientY: 800, pointerType: "mouse" })
      runFrames(1)
      expect(frameOf(container).style.transform).toBe("translate3d(1289.0px, 789.0px, 0)")
    })

    it("does not jump when pressed: the press transform never reaches the position", () => {
      // Regression: `scale` on the same element as the translate multiplied the translation.
      const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")
      expect(css).not.toMatch(/\.mc\[data-pressed="on"\]\s+\.mc-frame\s*\{/)
      expect(css).toMatch(/\.mc\[data-pressed="on"\]\s+\.mc-body\s*\{[^}]*scale/)
      mockMedia(true)
      const { container } = render(<Stage onCapture={vi.fn()} />)
      expect(container.querySelector(".mc-frame > .mc-body")).not.toBeNull()
    })

    it("keeps the frame put when the press scales the target", () => {
      mockMedia(true)
      const { container } = render(<Stage onCapture={vi.fn()} />)
      const button = container.querySelector("button")!
      fireEvent.pointerMove(button, { clientX: 224, clientY: 224, pointerType: "mouse" })
      runFrames(40)
      const before = { t: frameOf(container).style.transform, w: frameOf(container).style.width }
      fireEvent.pointerDown(button, { clientX: 224, clientY: 224, pointerType: "mouse", button: 0 })
      pressScale = 0.9
      runFrames(40)
      expect({ t: frameOf(container).style.transform, w: frameOf(container).style.width }).toEqual(before)
      fireEvent.pointerUp(button, { clientX: 224, clientY: 224, pointerType: "mouse" })
      runFrames(40)
      expect(frameOf(container).style.width).not.toBe(before.w)
    })

    it("activates the captured star exactly once when the click lands in the capture zone but outside it", () => {
      mockMedia(true)
      const onActivate = vi.fn()
      const { container } = render(<Stage onCapture={vi.fn()} onActivate={onActivate} />)
      const main = container.querySelector("main")!
      fireEvent.pointerMove(main, { clientX: 260, clientY: 224, pointerType: "mouse" })
      runFrames(2)
      expect(container.querySelector(".mc")?.getAttribute("data-state")).toBe("captured")
      fireEvent.click(main, { clientX: 260, clientY: 224, detail: 1 })
      expect(onActivate).toHaveBeenCalledTimes(1)
    })

    it("does not double-activate a click that already lands on the captured star", () => {
      mockMedia(true)
      const onActivate = vi.fn()
      const { container } = render(<Stage onCapture={vi.fn()} onActivate={onActivate} />)
      const button = container.querySelector("button")!
      fireEvent.pointerMove(button, { clientX: 224, clientY: 224, pointerType: "mouse" })
      runFrames(2)
      fireEvent.click(button, { detail: 1 })
      expect(onActivate).toHaveBeenCalledTimes(1)
    })

    it("does not turn a keyboard click elsewhere into an activation of the captured star", () => {
      mockMedia(true)
      const onActivate = vi.fn()
      const { container } = render(<Stage onCapture={vi.fn()} onActivate={onActivate} />)
      fireEvent.pointerMove(container.querySelector("main")!, { clientX: 260, clientY: 224, pointerType: "mouse" })
      runFrames(2)
      fireEvent.click(container.querySelector("input")!, { detail: 0 })
      expect(onActivate).not.toHaveBeenCalled()
    })

    it("idles once the pointer is still and everything has settled (free and captured)", () => {
      mockMedia(true)
      const { container } = render(<Stage onCapture={vi.fn()} />)
      const main = container.querySelector("main")!
      fireEvent.pointerMove(main, { clientX: 700, clientY: 600, pointerType: "mouse" })
      runFrames(90)
      expect(frames.length).toBe(0)
      fireEvent.pointerMove(main, { clientX: 224, clientY: 224, pointerType: "mouse" })
      runFrames(150)
      expect(container.querySelector(".mc")?.getAttribute("data-state")).toBe("captured")
      expect(frames.length).toBe(0)
      // ...and wakes on the next movement.
      fireEvent.pointerMove(main, { clientX: 700, clientY: 600, pointerType: "mouse" })
      expect(frames.length).toBeGreaterThan(0)
    })

    it("reads the reduced-motion query once, not on every frame", () => {
      mockMedia(true)
      const { container } = render(<Stage onCapture={vi.fn()} />)
      const main = container.querySelector("main")!
      fireEvent.pointerMove(main, { clientX: 700, clientY: 600, pointerType: "mouse" })
      runFrames(2)
      const after = reducedQueries
      for (let i = 0; i < 20; i++) {
        fireEvent.pointerMove(main, { clientX: 700 + i, clientY: 600, pointerType: "mouse" })
        runFrames(1)
      }
      expect(reducedQueries).toBe(after)
    })
  })
})
