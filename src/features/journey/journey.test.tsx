import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const checkHandle = vi.fn()
vi.mock("@/features/gate/actions", () => ({ checkHandle: (h: string) => checkHandle(h) }))
const track = vi.fn()
vi.mock("@/shared/analytics", () => ({ track: (...a: unknown[]) => track(...a) }))

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
  track.mockReset()
})

async function enter(handle: string) {
  render(<Journey />)
  fireEvent.change(screen.getByLabelText("Ingresa con tu Instagram"), { target: { value: handle } })
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }))
}

describe("Journey gate flow", () => {
  it("holds checking for at least 1100 ms even when the server answers at once", async () => {
    checkHandle.mockResolvedValue({ status: "granted" })
    await enter("ana")
    expect(screen.getByRole("status").textContent).toBe("Revisando la lista…")
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(screen.getByRole("status").textContent).toBe("Revisando la lista…")
    await act(() => vi.advanceTimersByTimeAsync(150))
    expect(screen.getByText("Hola")).toBeTruthy()
    expect(checkHandle).toHaveBeenCalledWith("ana")
  })

  it("warps into the sky after 1500 ms, then unmounts the gate layer 1300 ms later", async () => {
    checkHandle.mockResolvedValue({ status: "granted" })
    await enter("ana")
    await act(() => vi.advanceTimersByTimeAsync(1200))
    expect(screen.queryByRole("button", { name: "Historias" })).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(1500))
    expect(screen.getByRole("button", { name: "Historias" })).toBeTruthy()
    expect(screen.getByText("@ana")).toBeTruthy()
    await act(() => vi.advanceTimersByTimeAsync(1300))
    expect(screen.queryByText("@ana")).toBeNull()
  })

  it("shows the denied state with an invite request", async () => {
    checkHandle.mockResolvedValue({ status: "denied" })
    await enter("eve")
    await act(() => vi.advanceTimersByTimeAsync(1200))
    expect(screen.getByRole("status").textContent).toBe("@eve todavía no está en la lista.")
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    fireEvent.click(screen.getByRole("link", { name: "Pedir acceso por Instagram" }))
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByRole("status").textContent).toBe("Mensaje copiado. Pégalo en el DM a @patriciopastor_.")
    expect(screen.getByRole("link", { name: "Pedir acceso por Instagram" })).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it("fails closed when the server action throws", async () => {
    checkHandle.mockRejectedValue(new Error("boom"))
    await enter("ana")
    await act(() => vi.advanceTimersByTimeAsync(1200))
    expect(screen.getByRole("status").textContent).toBe("@ana todavía no está en la lista.")
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

    fireEvent.click(screen.getByRole("button", { name: "Ahora" }))
    expect(screen.getByRole("heading", { name: "Ahora" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Cielo" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /\[Foco actual\]/ }))
    expect(screen.getByRole("heading", { name: "[Foco actual]" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }))
    expect(screen.getByText("2 de 3")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Ahora" }))
    expect(screen.getByRole("heading", { name: "Ahora" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Cielo" }))
    expect(screen.getByRole("button", { name: "Historias" })).toBeTruthy()
  })
})

describe("Journey analytics", () => {
  it("tracks the gate outcome without ever sending the handle", async () => {
    checkHandle.mockResolvedValue({ status: "denied" })
    await enter("eve")
    await act(() => vi.advanceTimersByTimeAsync(1200))
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    fireEvent.click(screen.getByRole("link", { name: "Pedir acceso por Instagram" }))
    await act(() => vi.advanceTimersByTimeAsync(0))
    vi.unstubAllGlobals()
    expect(track.mock.calls.map((c) => c[0])).toEqual(["gate_submitted", "gate_denied", "access_requested"])
    expect(JSON.stringify(track.mock.calls)).not.toContain("eve")
  })

  it("tracks a granted gate, a facet and an entry by id and index only", async () => {
    checkHandle.mockResolvedValue({ status: "granted" })
    await enter("ana")
    await act(() => vi.advanceTimersByTimeAsync(1200))
    await act(() => vi.advanceTimersByTimeAsync(1500))
    fireEvent.click(screen.getByRole("button", { name: "Ahora" }))
    fireEvent.click(screen.getByRole("button", { name: /\[Foco actual\]/ }))
    expect(track.mock.calls).toEqual([
      ["gate_submitted"],
      ["gate_granted"],
      ["facet_opened", { facet: "now" }],
      ["entry_opened", { facet: "now", index: 0 }],
    ])
    expect(JSON.stringify(track.mock.calls)).not.toContain("ana")
  })
})
