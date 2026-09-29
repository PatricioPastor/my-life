import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const checkHandle = vi.fn()
vi.mock("@/features/gate/actions", () => ({ checkHandle: (h: string) => checkHandle(h) }))

import { Journey } from "./journey"

beforeEach(() => {
  vi.useFakeTimers()
  // jsdom has neither WebGL nor 2D canvas; both renderers degrade gracefully.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  checkHandle.mockReset()
})

async function enter(handle: string) {
  render(<Journey />)
  fireEvent.change(screen.getByLabelText("Enter with your Instagram"), { target: { value: handle } })
  fireEvent.click(screen.getByRole("button", { name: "Enter" }))
}

describe("Journey gate flow", () => {
  it("holds checking for at least 1100 ms even when the server answers at once", async () => {
    checkHandle.mockResolvedValue({ status: "granted" })
    await enter("ana")
    expect(screen.getByRole("status").textContent).toBe("Checking the list…")
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(screen.getByRole("status").textContent).toBe("Checking the list…")
    await act(() => vi.advanceTimersByTimeAsync(150))
    expect(screen.getByText("Welcome")).toBeTruthy()
    expect(checkHandle).toHaveBeenCalledWith("ana")
  })

  it("warps into the sky after 1500 ms, then unmounts the gate layer 1300 ms later", async () => {
    checkHandle.mockResolvedValue({ status: "granted" })
    await enter("ana")
    await act(() => vi.advanceTimersByTimeAsync(1200))
    expect(screen.queryByRole("button", { name: "Stories" })).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(1500))
    expect(screen.getByRole("button", { name: "Stories" })).toBeTruthy()
    expect(screen.getByText("@ana")).toBeTruthy()
    await act(() => vi.advanceTimersByTimeAsync(1300))
    expect(screen.queryByText("@ana")).toBeNull()
  })

  it("shows the denied state with an invite request", async () => {
    checkHandle.mockResolvedValue({ status: "denied" })
    await enter("eve")
    await act(() => vi.advanceTimersByTimeAsync(1200))
    expect(screen.getByRole("status").textContent).toBe("@eve isn’t on the list yet.")
    fireEvent.click(screen.getByRole("button", { name: "Ask for an invite" }))
    expect(screen.getByRole("status").textContent).toBe("Request sent.")
  })

  it("fails closed when the server action throws", async () => {
    checkHandle.mockRejectedValue(new Error("boom"))
    await enter("ana")
    await act(() => vi.advanceTimersByTimeAsync(1200))
    expect(screen.getByRole("status").textContent).toBe("@ana isn’t on the list yet.")
  })

  it("clears its timers on unmount", async () => {
    checkHandle.mockResolvedValue({ status: "granted" })
    await enter("ana")
    cleanup()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("Journey after the gate", () => {
  it("dives into a facet, opens an entry and pages through it", async () => {
    checkHandle.mockResolvedValue({ status: "granted" })
    await enter("ana")
    await act(() => vi.advanceTimersByTimeAsync(1200))
    await act(() => vi.advanceTimersByTimeAsync(1500))

    fireEvent.click(screen.getByRole("button", { name: "Now" }))
    expect(screen.getByRole("heading", { name: "Now" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Sky" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /\[Current focus\]/ }))
    expect(screen.getByRole("heading", { name: "[Current focus]" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Next page" }))
    expect(screen.getByText("2 of 3")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Now" }))
    expect(screen.getByRole("heading", { name: "Now" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Sky" }))
    expect(screen.getByRole("button", { name: "Stories" })).toBeTruthy()
  })
})
