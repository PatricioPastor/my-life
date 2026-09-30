import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { Block } from "@/shared/content"
import { useReader } from "./use-reader"

const story = (second = "second paragraph here"): Block[] => [
  { type: "paragraph", runs: [{ kind: "text", text: "first paragraph here" }] },
  { type: "paragraph", runs: [{ kind: "text", text: second }] },
]

describe("useReader story identity", () => {
  it("keeps the position and progress when the blocks are rebuilt with the same content", () => {
    const { result, rerender } = renderHook(({ blocks }) => useReader(blocks), { initialProps: { blocks: story() } })
    act(() => result.current.next())
    expect(result.current.state.activeIndex).toBe(1)
    const painted = result.current.state.painted
    rerender({ blocks: story() })
    expect(result.current.state.activeIndex).toBe(1)
    expect(result.current.state.painted).toEqual(painted)
    expect(painted[0]).toBeGreaterThan(0)
  })

  it("starts over when the content really changes", () => {
    const { result, rerender } = renderHook(({ blocks }) => useReader(blocks), { initialProps: { blocks: story() } })
    act(() => result.current.next())
    expect(result.current.state.activeIndex).toBe(1)
    rerender({ blocks: story("another story entirely") })
    expect(result.current.state.activeIndex).toBe(0)
    expect(result.current.state.painted).toEqual([0, 0])
  })
})
