import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ContextPanel, HINT_TEXT } from "./context-panel"
import { DWELL_MS } from "./context-machine"

const STAR = { id: "stories", label: "Historias", context: "Relatos de mi vida, en primera persona." }

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("reduced-motion"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const live = (c: HTMLElement) => c.querySelector("[aria-live]")?.textContent
const phase = (c: HTMLElement) => c.querySelector(".cp")?.getAttribute("data-phase")

describe("ContextPanel", () => {
  it("is a polite live region and says nothing until the dwell passes", () => {
    const { container } = render(<ContextPanel target={STAR} />)
    expect(container.querySelector("[aria-live]")?.getAttribute("aria-live")).toBe("polite")
    expect(phase(container)).toBe("hidden")
    expect(live(container)).toBe("")
    act(() => vi.advanceTimersByTime(DWELL_MS - 50))
    expect(phase(container)).toBe("hidden")
    act(() => vi.advanceTimersByTime(60))
    expect(phase(container)).toBe("hint")
    expect(live(container)).toBe(HINT_TEXT)
  })

  it("expands with Ctrl held, collapses on release and hides with the star", () => {
    const { container, rerender } = render(<ContextPanel target={STAR} />)
    act(() => vi.advanceTimersByTime(DWELL_MS + 10))
    fireEvent.keyDown(window, { key: "Control" })
    expect(phase(container)).toBe("expanded")
    expect(live(container)).toBe(`Historias. ${STAR.context}`)
    fireEvent.keyUp(window, { key: "Control" })
    expect(phase(container)).toBe("hint")
    rerender(<ContextPanel target={null} />)
    expect(phase(container)).toBe("hidden")
    expect(live(container)).toBe("")
  })

  it("treats Meta as Ctrl and resets on window blur", () => {
    const { container } = render(<ContextPanel target={STAR} />)
    act(() => vi.advanceTimersByTime(DWELL_MS + 10))
    fireEvent.keyDown(window, { key: "Meta" })
    expect(phase(container)).toBe("expanded")
    fireEvent.blur(window)
    expect(phase(container)).toBe("hint")
  })

  it("shows the hint and description as plain text under reduced motion", () => {
    const { container } = render(<ContextPanel target={STAR} />)
    act(() => vi.advanceTimersByTime(DWELL_MS + 10))
    expect(container.querySelector(".cp-hint")?.textContent).toBe(HINT_TEXT)
    fireEvent.keyDown(window, { key: "Control" })
    expect(container.querySelector(".cp-text")?.textContent).toBe(STAR.context)
  })

  it("ignores stars that have no description", () => {
    const { container } = render(<ContextPanel target={{ id: null, label: "Abrir", context: null }} />)
    act(() => vi.advanceTimersByTime(DWELL_MS + 10))
    fireEvent.keyDown(window, { key: "Control" })
    expect(phase(container)).toBe("hidden")
  })

  it("clears its timer and listeners on unmount", () => {
    const { unmount } = render(<ContextPanel target={STAR} />)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
