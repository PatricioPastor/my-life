import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const checkHandle = vi.fn()
vi.mock("@/features/gate/actions", () => ({ checkHandle: (h: string) => checkHandle(h) }))
const listMemories = vi.fn()
vi.mock("@/features/memories/actions", () => ({
  listMemories: () => listMemories(),
  prepareUpload: vi.fn(),
  createMemory: vi.fn(),
  suggestPlace: vi.fn(),
  resolveMapsLink: vi.fn(),
}))
const track = vi.fn()
vi.mock("@/shared/analytics", () => ({ track: (...a: unknown[]) => track(...a) }))

import { Journey } from "./journey"
import { ORB_EXIT_MS, ORB_RETURN_EXIT_MS, ORB_RETURN_MS, ORB_RETURN_REDUCED_MS, ORB_WARP_MS } from "./portal-timing"

beforeEach(() => {
  listMemories.mockResolvedValue({ ok: true, memories: [] })
  vi.useFakeTimers()
  // jsdom has neither WebGL nor 2D canvas; both renderers degrade gracefully.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  checkHandle.mockReset()
  listMemories.mockReset()
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
    expect(screen.getByRole("button", { name: "Universo" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /\[Foco actual\]/ }))
    expect(screen.getByRole("heading", { name: "[Foco actual]" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }))
    expect(screen.getByText("2 de 3")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Ahora" }))
    expect(screen.getByRole("heading", { name: "Ahora" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Universo" }))
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

  it("tracks gate_submitted once per submit, not for refused or repeated submits", async () => {
    checkHandle.mockResolvedValue({ status: "denied" })
    render(<Journey />)
    const input = screen.getByLabelText("Ingresa con tu Instagram")
    fireEvent.change(input, { target: { value: "bad handle!" } })
    fireEvent.submit(input.closest("form")!)
    expect(track).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: "eve" } })
    const form = input.closest("form")!
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(track.mock.calls).toEqual([["gate_submitted"]])
    await act(() => vi.advanceTimersByTimeAsync(1200))
    expect(track.mock.calls.map((c) => c[0])).toEqual(["gate_submitted", "gate_denied"])
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

describe("Journey replay control", () => {
  it("offers Ver intro on the gate and reports the press", () => {
    const onReplayIntro = vi.fn()
    render(<Journey onReplayIntro={onReplayIntro} />)
    fireEvent.click(screen.getByRole("button", { name: "Ver intro" }))
    expect(onReplayIntro).toHaveBeenCalledTimes(1)
  })

  it("is not rendered without a handler", () => {
    render(<Journey />)
    expect(screen.queryByRole("button", { name: "Ver intro" })).toBeNull()
  })

  it("hides during the warp and comes back on the sky", async () => {
    checkHandle.mockResolvedValue({ status: "granted" })
    render(<Journey onReplayIntro={vi.fn()} />)
    fireEvent.change(screen.getByLabelText("Ingresa con tu Instagram"), { target: { value: "ana" } })
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }))
    await act(() => vi.advanceTimersByTimeAsync(1200))
    expect(screen.queryByRole("button", { name: "Ver intro" })).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(1500))
    expect(screen.getByRole("button", { name: "Ver intro" })).toBeTruthy()
  })

  it("is not offered inside a facet", async () => {
    checkHandle.mockResolvedValue({ status: "granted" })
    render(<Journey onReplayIntro={vi.fn()} />)
    fireEvent.change(screen.getByLabelText("Ingresa con tu Instagram"), { target: { value: "ana" } })
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }))
    await act(() => vi.advanceTimersByTimeAsync(1200))
    await act(() => vi.advanceTimersByTimeAsync(1500))
    fireEvent.click(screen.getByRole("button", { name: "Ahora" }))
    expect(screen.queryByRole("button", { name: "Ver intro" })).toBeNull()
  })
})

async function toSky(props: Parameters<typeof Journey>[0] = {}) {
  checkHandle.mockResolvedValue({ status: "granted" })
  render(<Journey {...props} />)
  fireEvent.change(screen.getByLabelText("Ingresa con tu Instagram"), { target: { value: "ana" } })
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }))
  await act(() => vi.advanceTimersByTimeAsync(1200))
  await act(() => vi.advanceTimersByTimeAsync(1500))
}

describe("Journey memory orb", () => {
  it("offers the orb on the sky only: not at the gate, not inside a facet", async () => {
    render(<Journey />)
    expect(screen.queryByRole("button", { name: "Agregar recuerdo" })).toBeNull()
    cleanup()
    await toSky()
    expect(screen.getByRole("button", { name: "Agregar recuerdo" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Ahora" }))
    expect(screen.queryByRole("button", { name: "Agregar recuerdo" })).toBeNull()
  })

  it("flies through the portal to the memories space and comes back to the sky", async () => {
    await toSky({ onReplayIntro: vi.fn() })
    fireEvent.click(screen.getByRole("button", { name: "Agregar recuerdo" }))
    expect(track).toHaveBeenLastCalledWith("memory_orb_opened")
    // The portal is opening: the sky controls are gone, the memories are not here yet.
    expect(screen.queryByRole("button", { name: "Agregar recuerdo" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Historias" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Recuerdos" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Ver intro" })).toBeNull()

    await act(() => vi.advanceTimersByTimeAsync(1800))
    expect(screen.getByRole("heading", { name: "Recuerdos" })).toBeTruthy()
    expect(screen.getByText("Todavía no hay recuerdos.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Ver intro" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Universo" }))
    // The way back runs the tunnel too: the sky is not here yet, and the trip is faster than the way in.
    expect(screen.queryByRole("button", { name: "Historias" })).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(ORB_RETURN_MS + 50))
    expect(screen.getByRole("button", { name: "Historias" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Agregar recuerdo" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Recuerdos" })).toBeNull()
  })

  it("returns through the portal: the tunnel opens over the memories, then fades into the sky", async () => {
    await toSky({ onReplayIntro: vi.fn() })
    fireEvent.click(screen.getByRole("button", { name: "Agregar recuerdo" }))
    await act(() => vi.advanceTimersByTimeAsync(ORB_WARP_MS + 100))
    await act(() => vi.advanceTimersByTimeAsync(ORB_EXIT_MS + 100))
    expect(document.querySelector("[data-portal]")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Universo" }))
    // The tunnel is up and the memories are still beneath it; the way back cannot be pressed twice.
    expect(document.querySelector("[data-portal]")).not.toBeNull()
    expect(screen.getByRole("heading", { name: "Recuerdos" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Universo" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Ver intro" })).toBeNull()

    await act(() => vi.advanceTimersByTimeAsync(ORB_RETURN_MS - 50))
    expect(screen.queryByRole("button", { name: "Historias" })).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(100))
    // Arrived: the sky is back, the tunnel lingers over it for its half-second fade, then goes.
    expect(screen.getByRole("button", { name: "Historias" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Recuerdos" })).toBeNull()
    expect(screen.getByRole("button", { name: "Ver intro" })).toBeTruthy()
    expect(document.querySelector("[data-portal]")).not.toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(ORB_RETURN_EXIT_MS + 50))
    expect(document.querySelector("[data-portal]")).toBeNull()
    cleanup()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("takes the whole return in about half the time of the way in", async () => {
    await toSky()
    fireEvent.click(screen.getByRole("button", { name: "Agregar recuerdo" }))
    await act(() => vi.advanceTimersByTimeAsync(ORB_WARP_MS + ORB_EXIT_MS + 100))
    fireEvent.click(screen.getByRole("button", { name: "Universo" }))
    await act(() => vi.advanceTimersByTimeAsync(ORB_RETURN_MS + ORB_RETURN_EXIT_MS + 100))
    expect(screen.getByRole("button", { name: "Historias" })).toBeTruthy()
    expect(document.querySelector("[data-portal]")).toBeNull()
    expect(ORB_RETURN_MS + ORB_RETURN_EXIT_MS).toBeLessThan((ORB_WARP_MS + ORB_EXIT_MS) / 1.6)
  })

  it("clears its timers if the visitor leaves in the middle of the way back", async () => {
    await toSky()
    fireEvent.click(screen.getByRole("button", { name: "Agregar recuerdo" }))
    await act(() => vi.advanceTimersByTimeAsync(ORB_WARP_MS + ORB_EXIT_MS + 100))
    fireEvent.click(screen.getByRole("button", { name: "Universo" }))
    await act(() => vi.advanceTimersByTimeAsync(ORB_RETURN_MS / 2))
    cleanup()
    expect(vi.getTimerCount()).toBe(0)
  })

  describe("under reduced motion", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "matchMedia",
        (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }),
      )
    })
    afterEach(() => vi.unstubAllGlobals())

    it("crossfades back to the sky in a moment, with no tunnel", async () => {
      await toSky()
      fireEvent.click(screen.getByRole("button", { name: "Agregar recuerdo" }))
      await act(() => vi.advanceTimersByTimeAsync(ORB_WARP_MS + ORB_EXIT_MS + 100))
      fireEvent.click(screen.getByRole("button", { name: "Universo" }))
      expect(document.querySelector("[data-portal]")).toBeNull()
      expect(screen.getByRole("heading", { name: "Recuerdos" })).toBeTruthy()
      // The memories fade out over the sky instead of being cut.
      const place = screen.getByRole("heading", { name: "Recuerdos" }).closest("[data-memories-layer]") as HTMLElement
      expect(place.style.opacity).toBe("0")
      await act(() => vi.advanceTimersByTimeAsync(ORB_RETURN_REDUCED_MS + 50))
      expect(screen.getByRole("button", { name: "Historias" })).toBeTruthy()
      expect(screen.queryByRole("heading", { name: "Recuerdos" })).toBeNull()
      expect(document.querySelector("[data-portal]")).toBeNull()
      cleanup()
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it("tracks the orb once, with no props", async () => {
    await toSky()
    fireEvent.click(screen.getByRole("button", { name: "Agregar recuerdo" }))
    const orbCalls = track.mock.calls.filter((c) => c[0] === "memory_orb_opened")
    expect(orbCalls).toEqual([["memory_orb_opened"]])
  })

  it("tracks memory_orb_summoned once per R on the sky, with no props", async () => {
    await toSky()
    fireEvent.keyDown(window, { key: "r" })
    fireEvent.keyDown(window, { key: "R" })
    fireEvent.keyDown(window, { key: "r", repeat: true })
    fireEvent.keyDown(window, { key: "r", ctrlKey: true })
    const calls = track.mock.calls.filter((c) => c[0] === "memory_orb_summoned")
    expect(calls).toEqual([["memory_orb_summoned"], ["memory_orb_summoned"]])
  })

  it("never summons at the gate, typing the handle, or inside a facet", async () => {
    render(<Journey />)
    const input = screen.getByLabelText("Ingresa con tu Instagram")
    fireEvent.keyDown(input, { key: "r" })
    fireEvent.keyDown(window, { key: "r" })
    cleanup()
    await toSky()
    fireEvent.click(screen.getByRole("button", { name: "Ahora" }))
    fireEvent.keyDown(window, { key: "r" })
    expect(track.mock.calls.filter((c) => c[0] === "memory_orb_summoned")).toEqual([])
  })

  it("does not summon while the intro layer is replaying over the sky", async () => {
    await toSky()
    const layer = document.createElement("div")
    layer.setAttribute("data-blocks-shortcuts", "")
    document.body.appendChild(layer)
    fireEvent.keyDown(window, { key: "r" })
    layer.remove()
    expect(track.mock.calls.filter((c) => c[0] === "memory_orb_summoned")).toEqual([])
  })

  it("keeps the facet journey working after a round trip to the memories", async () => {
    await toSky()
    fireEvent.click(screen.getByRole("button", { name: "Agregar recuerdo" }))
    await act(() => vi.advanceTimersByTimeAsync(1800))
    fireEvent.click(screen.getByRole("button", { name: "Universo" }))
    await act(() => vi.advanceTimersByTimeAsync(ORB_RETURN_MS + 50))
    fireEvent.click(screen.getByRole("button", { name: "Ahora" }))
    expect(screen.getByRole("heading", { name: "Ahora" })).toBeTruthy()
  })

  it("lets the portal layer go after it has opened, and clears its timers on unmount", async () => {
    await toSky()
    fireEvent.click(screen.getByRole("button", { name: "Agregar recuerdo" }))
    await act(() => vi.advanceTimersByTimeAsync(1800))
    expect(document.querySelector("[data-portal]")).not.toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(1400))
    expect(document.querySelector("[data-portal]")).toBeNull()
    cleanup()
    expect(vi.getTimerCount()).toBe(0)
  })
})
