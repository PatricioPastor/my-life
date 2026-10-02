import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import { renderToString } from "react-dom/server"
import { SharedMemory } from "./shared-memory"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
const track = vi.fn()
vi.mock("@/shared/analytics", () => ({ track: (...args: unknown[]) => track(...args) }))

const memory: MemoryView = {
  id: "11111111-1111-4111-8111-111111111111",
  caption: "Una tarde de lluvia",
  happenedOn: "2024-03-12",
  status: "approved",
  width: 800,
  height: 600,
  kind: "image",
  takenAt: null,
  dominantColor: null,
  place: null,
  orbColor: "#8ab4ff",
  viewCount: 0,
  thumbUrl: "https://res.cloudinary.com/demo/t",
  fullUrl: "https://res.cloudinary.com/demo/f",
  audio: null,
}

let frames: Array<(now: number) => void> = []
let clock = 0
beforeEach(() => {
  push.mockReset()
  track.mockReset()
  frames = []
  clock = performance.now() + 100
  vi.stubGlobal("matchMedia", undefined)
  vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => frames.push(cb))
  vi.stubGlobal("cancelAnimationFrame", () => {})
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function flyUntilOpen() {
  for (let i = 0; i < 60 && !screen.queryByRole("dialog"); i++) {
    const batch = frames
    frames = []
    clock += 100
    act(() => batch.forEach((cb) => cb(clock)))
  }
}

describe("SharedMemory", () => {
  it("tracks shared_memory_opened once, with no props, however often it renders", () => {
    const { rerender } = render(<SharedMemory memory={memory} shareUrl="https://example.com/m/t" />)
    rerender(<SharedMemory memory={memory} shareUrl="https://example.com/m/t" />)
    expect(track.mock.calls.filter(([name]) => name === "shared_memory_opened")).toEqual([["shared_memory_opened"]])
  })

  it("opens only that memory in the glass, in the memories dimension (void and dust)", () => {
    const { container } = render(<SharedMemory memory={memory} shareUrl="https://example.com/m/t" />)
    flyUntilOpen()
    expect(screen.getByRole("dialog", { name: "Una tarde de lluvia" })).toBeTruthy()
    expect(container.querySelector("[data-void]")).not.toBeNull()
    expect(container.querySelector("canvas")).not.toBeNull()
  })

  it("has no add button and no previous or next", () => {
    render(<SharedMemory memory={memory} shareUrl="https://example.com/m/t" />)
    flyUntilOpen()
    expect(screen.queryByRole("button", { name: /Agregar/, hidden: true })).toBeNull()
    expect(screen.queryByRole("button", { name: "Anterior" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Siguiente" })).toBeNull()
  })

  it("goes to the start from Universo, from Esc and from Cerrar", () => {
    render(<SharedMemory memory={memory} shareUrl="https://example.com/m/t" />)
    flyUntilOpen()
    fireEvent.click(screen.getByRole("button", { name: /Universo/ }))
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }))
    expect(push).toHaveBeenCalledTimes(3)
    expect(push.mock.calls.every(([to]) => to === "/")).toBe(true)
  })

  it("offers Entrar al universo as a plain link to the start", async () => {
    render(<SharedMemory memory={memory} shareUrl="https://example.com/m/t" />)
    flyUntilOpen()
    await waitFor(() => expect(screen.getByRole("link", { name: "Entrar al universo" }).getAttribute("href")).toBe("/"))
  })

  it("lets a guest share it again: Compartir passes on the link they hold, with no server call", async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
    render(<SharedMemory memory={memory} shareUrl="https://example.com/m/t" />)
    flyUntilOpen()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Compartir" }))
    })
    expect(writeText).toHaveBeenCalledWith("https://example.com/m/t")
    expect(track).toHaveBeenCalledWith("memory_shared")
  })

  it("renders only the dark page on the server: the place waits for the real viewport", () => {
    const html = renderToString(<SharedMemory memory={memory} shareUrl="https://example.com/m/t" />)
    expect(html).not.toContain("data-void")
    expect(html).not.toContain("Una tarde de lluvia")
  })
})
