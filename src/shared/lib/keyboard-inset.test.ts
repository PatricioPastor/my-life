import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { keyboardInset, KEYBOARD_MIN_PX } from "./keyboard-inset"
import { useKeyboardInset } from "./use-keyboard-inset"

describe("keyboardInset", () => {
  it("is zero when the visual viewport fills the layout viewport", () => {
    expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0)
  })

  it("is the part of the layout viewport the visual viewport no longer covers", () => {
    expect(keyboardInset(844, { height: 544, offsetTop: 0 })).toBe(300)
  })

  it("does not count the part the page was panned away by", () => {
    expect(keyboardInset(844, { height: 544, offsetTop: 40 })).toBe(260)
  })

  it("ignores a collapsing browser toolbar, which is not a keyboard", () => {
    expect(keyboardInset(844, { height: 844 - (KEYBOARD_MIN_PX - 1), offsetTop: 0 })).toBe(0)
  })

  it("is never negative (pinch zoom makes the visual viewport smaller or larger than the layout one)", () => {
    expect(keyboardInset(844, { height: 900, offsetTop: 0 })).toBe(0)
  })
})

describe("useKeyboardInset", () => {
  const original = Object.getOwnPropertyDescriptor(window, "visualViewport")
  afterEach(() => {
    if (original) Object.defineProperty(window, "visualViewport", original)
    else Reflect.deleteProperty(window, "visualViewport")
  })

  function fakeViewport(height: number) {
    const target = new EventTarget() as EventTarget & { height: number; offsetTop: number }
    target.height = height
    target.offsetTop = 0
    Object.defineProperty(window, "visualViewport", { configurable: true, value: target })
    return target
  }

  it("follows the visual viewport as the keyboard opens and closes", () => {
    const vv = fakeViewport(window.innerHeight)
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current).toBe(0)
    act(() => {
      vv.height = window.innerHeight - 320
      vv.dispatchEvent(new Event("resize"))
    })
    expect(result.current).toBe(320)
    act(() => {
      vv.height = window.innerHeight
      vv.dispatchEvent(new Event("resize"))
    })
    expect(result.current).toBe(0)
  })

  it("is zero where there is no visual viewport", () => {
    Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined })
    const { result } = renderHook(() => useKeyboardInset())
    expect(result.current).toBe(0)
  })
})
