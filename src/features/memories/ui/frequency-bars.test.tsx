import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BAR_REST } from "./audio-bars"
import { FrequencyBars } from "./frequency-bars"
import type { AudioGraph } from "./use-audio-level"

const loud = new Uint8Array(1024).fill(220)
const graph: AudioGraph = { level: () => 0.6, spectrum: () => loud, setVolume: () => {} }

let frames: Array<(now: number) => void> = []
const run = (count: number) => {
  for (let i = 1; i <= count; i++) {
    const batch = frames
    frames = []
    act(() => batch.forEach((cb) => cb(i * 16)))
  }
}
const scales = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>("[data-glass-bar]")).map((bar) => Number(/scaleY\(([\d.]+)\)/.exec(bar.style.transform)?.[1]))

beforeEach(() => {
  frames = []
  vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => frames.push(cb))
  vi.stubGlobal("cancelAnimationFrame", () => {})
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("FrequencyBars", () => {
  it("rises with the spectrum while it plays", () => {
    const { container } = render(<FrequencyBars graph={graph} playing reduced={false} />)
    run(20)
    expect(Math.max(...scales(container))).toBeGreaterThan(BAR_REST + 0.2)
  })

  it("goes back to the baseline when reduced motion is turned on while it plays, instead of freezing mid-height", () => {
    const { container, rerender } = render(<FrequencyBars graph={graph} playing reduced={false} />)
    run(20)
    expect(Math.max(...scales(container))).toBeGreaterThan(BAR_REST + 0.2)
    rerender(<FrequencyBars graph={graph} playing reduced />)
    run(3)
    expect(scales(container).every((scale) => scale === BAR_REST)).toBe(true)
  })

  it("moves again when reduced motion is turned off", () => {
    const { container, rerender } = render(<FrequencyBars graph={graph} playing reduced />)
    run(5)
    expect(scales(container).every((scale) => scale === BAR_REST)).toBe(true)
    rerender(<FrequencyBars graph={graph} playing reduced={false} />)
    run(20)
    expect(Math.max(...scales(container))).toBeGreaterThan(BAR_REST + 0.2)
  })
})
