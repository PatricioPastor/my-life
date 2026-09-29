import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { GateScreen } from "./gate-screen"
import type { GateState } from "./gate-machine"

beforeEach(() => {
  // jsdom has no 2D canvas; the tunnel renderer degrades to nothing.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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

  it("offers an Instagram DM link when denied", () => {
    setup({ status: "denied", handle: "eve" })
    expect(screen.getByRole("status").textContent).toBe("@eve isn’t on the list yet.")
    const link = screen.getByRole("link", { name: "Ask for access on Instagram" })
    expect(link.getAttribute("href")).toBe("https://ig.me/m/patriciopastor_")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer")
  })

  it("copies the message on click and reports it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    const h = setup({ status: "denied", handle: "eve" })
    fireEvent.click(screen.getByRole("link", { name: "Ask for access on Instagram" }))
    expect(writeText).toHaveBeenCalledWith("Hi! I'd like access to your site. My Instagram is @eve.")
    await waitFor(() => expect(h.onRequestInvite).toHaveBeenCalledWith(true))
  })

  it("still reports the request when the clipboard is unavailable", async () => {
    vi.stubGlobal("navigator", {})
    const h = setup({ status: "denied", handle: "eve" })
    fireEvent.click(screen.getByRole("link", { name: "Ask for access on Instagram" }))
    await waitFor(() => expect(h.onRequestInvite).toHaveBeenCalledWith(false))
  })

  it("tells the visitor to paste when the message was copied, without claiming anything was sent", () => {
    setup({ status: "requested", handle: "eve", copied: true })
    expect(screen.getByRole("status").textContent).toBe("Message copied. Paste it in the DM to @patriciopastor_.")
    expect(screen.getByRole("link", { name: "Ask for access on Instagram" })).toBeTruthy()
  })

  it("tells the visitor to send the DM when nothing was copied", () => {
    setup({ status: "requested", handle: "eve", copied: false })
    expect(screen.getByRole("status").textContent).toBe("Send a DM to @patriciopastor_ from @eve.")
    expect(screen.getByRole("link", { name: "Ask for access on Instagram" })).toBeTruthy()
  })

  it("welcomes a granted handle in place of the form", () => {
    setup({ status: "granted", handle: "ana" })
    expect(screen.getByText("Welcome")).toBeTruthy()
    expect(screen.getByText("@ana")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Enter" })).toBeNull()
  })
})
