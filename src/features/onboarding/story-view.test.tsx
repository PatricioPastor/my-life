import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Story } from "@/shared/content"

const track = vi.fn()
vi.mock("@/shared/analytics", () => ({ track: (...a: unknown[]) => track(...a) }))
vi.mock("./film-grain", () => ({ FilmGrain: () => null }))

import { readingTimeline } from "./reader/timeline"
import { READ_START_MS, StoryView } from "./story-view"

const STORY: Story = {
  meta: { title: "¿por qué creé esto?", updated: "2026-09-30" },
  blocks: [
    { type: "paragraph", runs: [{ kind: "text", text: "Uno dos tres cuatro." }] },
    { type: "subheading", text: "un apartado" },
    {
      type: "paragraph",
      runs: [
        { kind: "text", text: "Cinco " },
        { kind: "em", text: "seis" },
        { kind: "text", text: " siete." },
      ],
    },
  ],
}
const TIMELINE = readingTimeline(STORY.blocks)
const END = TIMELINE.entries.map((e) => e.endMs)
const SETTLE = 600

const blocks = () => Array.from(document.querySelectorAll<HTMLElement>(".rd-block"))
const painted = (el: Element) => el.querySelectorAll("[data-p]").length
const active = () => blocks().findIndex((b) => b.getAttribute("aria-current") === "true")
const bar = () => screen.getByRole("progressbar")
const continueBtn = () => document.querySelector<HTMLButtonElement>(".ob-continue")!

function mount(props: Partial<Parameters<typeof StoryView>[0]> = {}) {
  return render(<StoryView story={STORY} from={null} away={false} onContinue={() => {}} {...props} />)
}
// In small steps, each in its own act: React commits (and runs the effects that schedule the next timer) between steps.
async function advance(ms: number) {
  for (let left = ms; left > 0; left -= 20) await act(() => vi.advanceTimersByTimeAsync(Math.min(20, left)))
}
function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduced && q.includes("reduced-motion"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

beforeEach(() => {
  // The reader keeps time with performance.now(), so the fake clock must drive it too.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance", "requestAnimationFrame", "cancelAnimationFrame"] })
  stubReducedMotion(false)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  track.mockReset()
})

describe("StoryView reading", () => {
  it("keeps all the text in the DOM, in order, whatever is painted", () => {
    mount()
    expect(blocks().map((b) => b.textContent)).toEqual(["Uno dos tres cuatro.", "un apartado", "Cinco seis siete."])
  })

  it("starts every word as an outline and paints them at reading pace", async () => {
    mount()
    expect(blocks().map(painted)).toEqual([0, 0, 0])
    await advance(READ_START_MS + 50)
    expect(painted(blocks()[0]!)).toBe(1)
    await advance(TIMELINE.entries[0]!.wordStarts[2]! + 50)
    expect(painted(blocks()[0]!)).toBe(3)
    expect(painted(blocks()[2]!)).toBe(0)
  })

  it("keeps a word whole across an emphasis boundary and never turns text into markup", () => {
    mount({
      story: {
        ...STORY,
        blocks: [{ type: "paragraph", runs: [{ kind: "text", text: "<img src=x onerror=alert(1)> y " }, { kind: "em", text: "muy" }, { kind: "text", text: ", si" }] }],
      },
    })
    expect(document.querySelector("img")).toBeNull()
    const words = Array.from(document.querySelectorAll(".rd-w")).map((w) => w.textContent)
    expect(words).toEqual(["<img", "src=x", "onerror=alert(1)>", "y", "muy", ",", "si"])
    expect(document.querySelector("em")?.textContent).toBe("muy")
  })

  it("marks the focused paragraph and springs to the next one by itself after the last word rests", async () => {
    mount()
    await advance(READ_START_MS)
    expect(active()).toBe(0)
    await advance(END[0]! + SETTLE + 100)
    expect(active()).toBe(2)
    expect(painted(blocks()[0]!)).toBe(4)
  })

  it("a wheel gesture completes the paragraph being left and focuses the next", async () => {
    mount()
    await advance(READ_START_MS + 300)
    expect(painted(blocks()[0]!)).toBeLessThan(4)
    fireEvent.wheel(document.querySelector(".ob-scroll")!, { deltaY: 120 })
    expect(active()).toBe(2)
    expect(painted(blocks()[0]!)).toBe(4)
  })

  it("moves with the keyboard: ArrowDown, PageDown and Space go on, ArrowUp and PageUp go back", async () => {
    mount()
    await advance(READ_START_MS)
    fireEvent.keyDown(document, { key: "ArrowDown" })
    expect(active()).toBe(2)
    fireEvent.keyDown(document, { key: "ArrowUp" })
    expect(active()).toBe(0)
    fireEvent.keyDown(document, { key: "PageDown" })
    expect(active()).toBe(2)
    fireEvent.keyDown(document, { key: "PageUp" })
    expect(active()).toBe(0)
    fireEvent.keyDown(document, { key: " " })
    expect(active()).toBe(2)
  })

  it("leaves keys alone when they belong to a button", async () => {
    mount()
    await advance(READ_START_MS)
    fireEvent.keyDown(screen.getByRole("button", { name: "Continuar", hidden: true }), { key: " " })
    expect(active()).toBe(0)
  })

  it("moves on a swipe", async () => {
    mount()
    await advance(READ_START_MS)
    const surface = document.querySelector(".ob-scroll")!
    fireEvent.touchStart(surface, { touches: [{ clientX: 100, clientY: 500 }] })
    fireEvent.touchMove(surface, { touches: [{ clientX: 100, clientY: 380 }] })
    expect(active()).toBe(2)
    fireEvent.touchEnd(surface)
    fireEvent.touchStart(surface, { touches: [{ clientX: 100, clientY: 300 }] })
    fireEvent.touchMove(surface, { touches: [{ clientX: 100, clientY: 420 }] })
    expect(active()).toBe(0)
  })

  it("shows the progress from the start and keeps it accurate", async () => {
    mount()
    expect(bar().getAttribute("aria-valuenow")).toBe("0")
    expect(bar().getAttribute("aria-valuemin")).toBe("0")
    expect(bar().getAttribute("aria-valuemax")).toBe("100")
    expect(bar().textContent).toBe("00%")
    await advance(READ_START_MS + 50)
    expect(bar().getAttribute("aria-valuenow")).toBe("14") // 1 of 7 words
  })

  it("hides Continuar until the reading is complete, then reveals it", async () => {
    const onContinue = vi.fn()
    mount({ onContinue })
    expect(continueBtn().hasAttribute("inert")).toBe(true)
    expect(continueBtn().getAttribute("data-ready")).toBe("false")
    await advance(READ_START_MS + END[0]! + SETTLE + END[2]! + 200)
    expect(bar().getAttribute("aria-valuenow")).toBe("100")
    expect(continueBtn().hasAttribute("inert")).toBe(false)
    expect(continueBtn().getAttribute("data-ready")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }))
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it("lets a visitor finish at their own pace: next on the last paragraph completes it", async () => {
    mount()
    await advance(READ_START_MS)
    fireEvent.keyDown(document, { key: "ArrowDown" })
    fireEvent.keyDown(document, { key: "ArrowDown" })
    expect(bar().getAttribute("aria-valuenow")).toBe("100")
    expect(continueBtn().hasAttribute("inert")).toBe(false)
  })

  it("tracks the completion once, with no payload", async () => {
    mount()
    await advance(READ_START_MS)
    fireEvent.keyDown(document, { key: "ArrowDown" })
    fireEvent.keyDown(document, { key: "ArrowDown" })
    fireEvent.keyDown(document, { key: "ArrowUp" })
    fireEvent.keyDown(document, { key: "ArrowDown" })
    expect(track.mock.calls).toEqual([["story_completed"]])
  })

  it("ignores gestures while another step is on stage", async () => {
    mount({ away: true })
    await advance(READ_START_MS)
    fireEvent.keyDown(document, { key: "ArrowDown" })
    expect(active()).toBe(0)
  })

  it("can take the keyboard: the surface is focusable", () => {
    mount()
    expect(document.querySelector(".ob-scroll")!.getAttribute("tabindex")).toBe("-1")
  })
})

describe("StoryView with reduced motion", () => {
  it("shows every word filled, with the focus carried by opacity alone", () => {
    stubReducedMotion(true)
    mount()
    const words = document.querySelectorAll(".rd-w")
    expect(words.length).toBe(7)
    expect(document.querySelectorAll(".rd-w[data-p]").length).toBe(7)
    const stage = document.querySelector<HTMLElement>(".rd-stage")!
    expect(stage.getAttribute("data-reduced")).toBe("true")
    expect(stage.style.getPropertyValue("--rd-s")).toBe("1")
  })

  it("still paces the reading and the progress", async () => {
    stubReducedMotion(true)
    mount()
    await advance(READ_START_MS + 50)
    expect(bar().getAttribute("aria-valuenow")).toBe("14")
  })
})

describe("StoryView motion", () => {
  it("scales the focused paragraph by the stage scale and leaves no outline-less words while painting", () => {
    mount()
    const stage = document.querySelector<HTMLElement>(".rd-stage")!
    expect(stage.getAttribute("data-reduced")).toBe("false")
    expect(Number(stage.style.getPropertyValue("--rd-s"))).toBeGreaterThan(1)
    expect(document.querySelectorAll(".rd-w[data-p]").length).toBe(0)
  })
})
