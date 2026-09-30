import { act, cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Block } from "@/shared/content"
import { initReader, type ReaderPlan } from "./reader-machine"
import { ReaderStage } from "./reader-stage"

/**
 * Guards for the per-word flicker. Painting a word must change one attribute on one word and nothing else: no re-mounted
 * spans, nothing written to the stack or the blocks (a write there flips compositing and re-rasterises the whole paragraph).
 */
const BLOCKS: Block[] = [
  { type: "paragraph", runs: [{ kind: "text", text: "Uno dos tres cuatro cinco." }] },
  { type: "paragraph", runs: [{ kind: "text", text: "Seis siete." }] },
]
const PLAN: ReaderPlan = {
  paragraphs: [
    { wordStarts: [0, 100, 200, 300, 400], endMs: 600 },
    { wordStarts: [0, 100], endMs: 300 },
  ],
}

const READABLES = [0, 1]
const stateWith = (painted: number[]) => ({ ...initReader(PLAN), painted })
const ui = (painted: number[]) => <ReaderStage blocks={BLOCKS} readables={READABLES} state={stateWith(painted)} reduced={false} onMeasure={() => {}} />

afterEach(cleanup)

/** The stack springs to its first position on mount; painting is only compared once it is at rest. */
const settled = () => vi.waitFor(() => expect(document.querySelector<HTMLElement>(".rd-stack")!.dataset.settled).toBe("true"))

describe("painting a word", () => {
  it("keeps every word span mounted: the same nodes before and after", () => {
    const view = render(ui([1, 0]))
    const before = Array.from(document.querySelectorAll(".rd-w"))
    view.rerender(ui([2, 0]))
    const after = Array.from(document.querySelectorAll(".rd-w"))
    expect(after.length).toBe(7)
    after.forEach((w, i) => expect(w).toBe(before[i]))
  })

  it("only ever sets data-p on the word that was painted", async () => {
    const view = render(ui([1, 0]))
    await settled()
    const seen: string[] = []
    const observer = new MutationObserver((list) => {
      for (const m of list) seen.push(`${m.type}:${m.attributeName ?? ""}:${(m.target as Element).className}`)
    })
    observer.observe(document.querySelector(".rd-stage")!, { subtree: true, childList: true, attributes: true, characterData: true })
    view.rerender(ui([2, 0]))
    await act(async () => {})
    view.rerender(ui([3, 0]))
    await act(async () => {})
    observer.disconnect()
    expect(seen).toEqual(["attributes:data-p:rd-w", "attributes:data-p:rd-w"])
  })

  it("never touches the stack or the blocks (their compositing state is not a function of painting)", async () => {
    const view = render(ui([1, 0]))
    await settled()
    const stack = document.querySelector<HTMLElement>(".rd-stack")!
    const snapshot = () => [stack.getAttribute("style"), stack.dataset.settled, ...Array.from(document.querySelectorAll(".rd-block")).map((b) => b.getAttribute("style"))]
    const before = snapshot()
    for (const n of [2, 3, 4, 5]) {
      view.rerender(ui([n, 0]))
      await act(async () => {})
    }
    expect(snapshot()).toEqual(before)
  })

  it("gives every word its own outline layer text, so the outline can fade out instead of vanishing", () => {
    render(ui([0, 0]))
    const words = Array.from(document.querySelectorAll<HTMLElement>(".rd-w"))
    expect(words.map((w) => w.getAttribute("data-t"))).toEqual(words.map((w) => w.textContent))
  })
})
