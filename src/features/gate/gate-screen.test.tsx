import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { GateScreen } from "./gate-screen"
import type { GateState } from "./gate-machine"

beforeEach(() => {
  // jsdom has no 2D canvas; the tunnel renderer degrades to nothing.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function setup(state: GateState) {
  const handlers = { onTyped: vi.fn(), onSubmit: vi.fn(), onRequestInvite: vi.fn() }
  render(<GateScreen state={state} {...handlers} />)
  return handlers
}

describe("GateScreen", () => {
  it("shows the idle status and a disabled submit for an empty handle", () => {
    setup({ status: "idle", handle: "" })
    expect(screen.getByRole("status").textContent).toBe("Invitation only.")
    expect((screen.getByRole("button", { name: "Enter" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("reports typing and submitting", () => {
    const h = setup({ status: "idle", handle: "ana" })
    fireEvent.change(screen.getByLabelText("Enter with your Instagram"), { target: { value: "@Bob" } })
    expect(h.onTyped).toHaveBeenCalledWith("@Bob")
    fireEvent.click(screen.getByRole("button", { name: "Enter" }))
    expect(h.onSubmit).toHaveBeenCalledTimes(1)
  })

  it("locks the input while checking", () => {
    setup({ status: "checking", handle: "ana" })
    expect(screen.getByRole("status").textContent).toBe("Checking the list…")
    expect((screen.getByLabelText("Enter with your Instagram") as HTMLInputElement).disabled).toBe(true)
  })

  it("explains an invalid handle", () => {
    setup({ status: "invalid", handle: "a-b" })
    expect(screen.getByRole("status").textContent).toBe("Use letters, numbers, periods or underscores.")
  })

  it("offers an invite request when denied", () => {
    const h = setup({ status: "denied", handle: "eve" })
    expect(screen.getByRole("status").textContent).toBe("@eve isn’t on the list yet.")
    fireEvent.click(screen.getByRole("button", { name: "Ask for an invite" }))
    expect(h.onRequestInvite).toHaveBeenCalledTimes(1)
  })

  it("confirms a sent request", () => {
    setup({ status: "requested", handle: "eve" })
    expect(screen.getByRole("status").textContent).toBe("Request sent.")
  })

  it("welcomes a granted handle in place of the form", () => {
    setup({ status: "granted", handle: "ana" })
    expect(screen.getByText("Welcome")).toBeTruthy()
    expect(screen.getByText("@ana")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Enter" })).toBeNull()
  })
})
