import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MagneticCursor, type CursorTarget } from "./magnetic-cursor"

let frames: FrameRequestCallback[] = []
let clock = 0

function mockMedia(fine: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("pointer: fine") ? fine : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

beforeEach(() => {
  frames = []
  clock = 0
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal("cancelAnimationFrame", () => {})
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.dataset.cursorLabel === "Historias") return { left: 200, top: 200, width: 48, height: 48, right: 248, bottom: 248, x: 200, y: 200 } as DOMRect
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

function Stage({ onCapture }: { onCapture: (t: CursorTarget | null) => void }) {
  const ref = useRef<HTMLElement>(null)
  return (
    <main ref={ref}>
      <button type="button" data-magnetic="strong" data-cursor-id="stories" data-cursor-label="Historias" data-cursor-context="x">
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
})
