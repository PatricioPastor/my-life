import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import { MemoriesSpace } from "./memories-space"

const listMemories = vi.fn()
const prepareUpload = vi.fn()
const createMemory = vi.fn()
const suggestPlace = vi.fn()
const resolveMapsLink = vi.fn()
const shareMemory = vi.fn()
const recordMemoryView = vi.fn()
const uploadToCloudinary = vi.fn()
vi.mock("../actions", () => ({
  listMemories: () => listMemories(),
  prepareUpload: () => prepareUpload(),
  createMemory: (input: unknown) => createMemory(input),
  suggestPlace: (input: unknown) => suggestPlace(input),
  resolveMapsLink: (input: unknown) => resolveMapsLink(input),
  shareMemory: (input: unknown) => shareMemory(input),
  recordMemoryView: (input: unknown) => recordMemoryView(input),
}))
vi.mock("./cloudinary-upload", () => ({ uploadToCloudinary: (o: unknown) => uploadToCloudinary(o) }))
vi.mock("@/shared/analytics", () => ({ track: vi.fn() }))

const view = (id: string, caption: string, over: Partial<MemoryView> = {}): MemoryView => ({
  id,
  caption,
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

  relatedId: null,
  thumbUrl: `https://res.cloudinary.com/demo/t/${id}`,
  fullUrl: `https://res.cloudinary.com/demo/f/${id}`,
  audio: null,
  ...over,
})

beforeEach(() => {
  vi.stubGlobal("matchMedia", undefined)
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }))
  prepareUpload.mockResolvedValue({ ok: true, upload: { cloudName: "demo", ticket: "t", photo: {}, audio: null } })
  uploadToCloudinary.mockResolvedValue({ ok: true })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe("MemoriesSpace adding a memory", () => {
  it("offers Contribuir once the memories are ready, even when there are none", async () => {
    listMemories.mockResolvedValue({ ok: true, memories: [] })
    render(<MemoriesSpace />)
    expect(await screen.findByRole("button", { name: "Contribuir" })).toBeTruthy()
  })

  it.each(["no_session", "unavailable"] as const)("does not offer it when loading failed (%s)", async (reason) => {
    listMemories.mockResolvedValue({ ok: false, reason })
    render(<MemoriesSpace />)
    await screen.findByRole("status")
    expect(screen.queryByRole("button", { name: "Contribuir" })).toBeNull()
  })

  it("appends the saved memory as a pending orb and leaves the others where they are", async () => {
    listMemories.mockResolvedValue({ ok: true, memories: [view("a", "El primer viaje")] })
    const saved = view("new", "Una tarde de lluvia", { status: "pending" })
    createMemory.mockResolvedValue({ ok: true, memory: saved, locationSaved: false })
    render(<MemoriesSpace />)
    await screen.findByRole("button", { name: /El primer viaje/ })
    const before = screen.getByRole("button", { name: /El primer viaje/ }).getAttribute("style")

    fireEvent.click(screen.getByRole("button", { name: "Contribuir" }))
    // Three steps: the photo, then the words and the date, then the color and Guardar recuerdo.
    fireEvent.change(screen.getByLabelText("Elegir foto"), { target: { files: [new File(["x"], "f.jpg", { type: "image/jpeg" })] } })
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }))
    fireEvent.change(screen.getByLabelText("¿Qué recuerdas?"), { target: { value: "Una tarde de lluvia" } })
    fireEvent.change(screen.getByLabelText("¿Cuándo fue?"), { target: { value: "2024-03-12" } })
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar recuerdo" }))

    await waitFor(() =>
      expect(createMemory).toHaveBeenCalledWith({
        ticket: "t",
        caption: "Una tarde de lluvia",
        happenedOn: "2024-03-12",
        happenedTime: null,
        shareLocation: false,
      }),
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 3000 })
    const orb = screen.getByRole("button", { name: /Una tarde de lluvia.*pendiente/i })
    expect(orb.getAttribute("data-pending")).toBe("true")
    expect(screen.getByRole("button", { name: /El primer viaje/ }).getAttribute("style")).toBe(before)
  })
})

describe("MemoriesSpace sharing", () => {
  it("asks the shareMemory action for the link of the memory open in the glass", async () => {
    listMemories.mockResolvedValue({ ok: true, memories: [view("a", "Una tarde")] })
    shareMemory.mockResolvedValue({ ok: false, reason: "not_shareable" })
    let frames: Array<(now: number) => void> = []
    let clock = performance.now() + 100
    vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => frames.push(cb))
    vi.stubGlobal("cancelAnimationFrame", () => {})
    render(<MemoriesSpace />)
    fireEvent.click(await screen.findByRole("button", { name: /Una tarde/ }))
    for (let i = 0; i < 60 && !screen.queryByRole("dialog"); i++) {
      const batch = frames
      frames = []
      clock += 100
      act(() => batch.forEach((cb) => cb(clock)))
    }
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Compartir" }))
    })
    expect(shareMemory).toHaveBeenCalledWith({ id: "a" })
  })
})

describe("MemoriesSpace counting views", () => {
  it("tells the recordMemoryView action about the memory the glass opened, and shows the count it brought", async () => {
    listMemories.mockResolvedValue({ ok: true, memories: [view("a", "Una tarde", { viewCount: 4 })] })
    recordMemoryView.mockResolvedValue({ ok: true, counted: true })
    shareMemory.mockResolvedValue({ ok: false, reason: "not_shareable" })
    let frames: Array<(now: number) => void> = []
    let clock = performance.now() + 100
    vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => frames.push(cb))
    vi.stubGlobal("cancelAnimationFrame", () => {})
    render(<MemoriesSpace />)
    fireEvent.click(await screen.findByRole("button", { name: /Una tarde/ }))
    for (let i = 0; i < 60 && !screen.queryByRole("dialog"); i++) {
      const batch = frames
      frames = []
      clock += 100
      act(() => batch.forEach((cb) => cb(clock)))
    }
    await act(async () => {})
    expect(recordMemoryView).toHaveBeenCalledTimes(1)
    expect(recordMemoryView).toHaveBeenCalledWith({ id: "a" })
    expect(within(screen.getByRole("dialog")).getByText("5 vistas")).toBeTruthy()
  })
})

describe("MemoriesSpace contributing from a memory", () => {
  let frames: Array<(now: number) => void> = []
  let clock = 0
  const openGlass = async (name: RegExp) => {
    fireEvent.click(await screen.findByRole("button", { name }))
    for (let i = 0; i < 60 && !screen.queryByRole("dialog"); i++) {
      const batch = frames
      frames = []
      clock += 100
      act(() => batch.forEach((cb) => cb(clock)))
    }
    await act(async () => {})
  }

  beforeEach(() => {
    frames = []
    clock = performance.now() + 100
    vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => frames.push(cb))
    vi.stubGlobal("cancelAnimationFrame", () => {})
    recordMemoryView.mockResolvedValue({ ok: true, counted: false })
    shareMemory.mockResolvedValue({ ok: false, reason: "not_shareable" })
  })

  const parent = view("5b8f0c5e-6d7a-4b1c-9d2e-3f4a5b6c7d8e", "La casa nueva", {
    happenedOn: "2023-07-04",
    place: { lat: -34.59, lng: -58.43, name: "UOCRA", address: "Av. Rivadavia 1234, Junín" },
  })

  it("opens the form from the glass with that memory's date, a chip, and its place on offer", async () => {
    listMemories.mockResolvedValue({ ok: true, memories: [parent] })
    render(<MemoriesSpace />)
    await openGlass(/La casa nueva/)
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Contribuir" }))
    const form = await screen.findByRole("dialog", { name: "Contribuir con un recuerdo" })
    expect((within(form).getByLabelText("¿Cuándo fue?") as HTMLInputElement).value).toBe("2023-07-04")
    expect(within(form).getByText("Relacionado con «La casa nueva»")).toBeTruthy()
    // "Mismo lugar" is under "¿Dónde fue?", on the second step.
    fireEvent.change(within(form).getByLabelText("Elegir foto"), { target: { files: [new File(["x"], "f.jpg", { type: "image/jpeg" })] } })
    fireEvent.click(within(form).getByRole("button", { name: "Siguiente" }))
    expect(within(form).getByRole("checkbox", { name: /Mismo lugar/ })).toBeTruthy()
  })

  it("stores the new memory as related to it", async () => {
    listMemories.mockResolvedValue({ ok: true, memories: [parent] })
    createMemory.mockResolvedValue({
      ok: true,
      memory: view("new", "El día después", { status: "pending", relatedId: parent.id }),
      locationSaved: true,
    })
    render(<MemoriesSpace />)
    await openGlass(/La casa nueva/)
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Contribuir" }))
    const form = await screen.findByRole("dialog", { name: "Contribuir con un recuerdo" })
    fireEvent.change(within(form).getByLabelText("Elegir foto"), { target: { files: [new File(["x"], "f.jpg", { type: "image/jpeg" })] } })
    fireEvent.click(within(form).getByRole("button", { name: "Siguiente" }))
    fireEvent.click(within(form).getByRole("checkbox", { name: /Mismo lugar/ }))
    fireEvent.change(within(form).getByLabelText("¿Qué recuerdas?"), { target: { value: "El día después" } })
    fireEvent.click(within(form).getByRole("button", { name: "Siguiente" }))
    fireEvent.click(within(form).getByRole("button", { name: "Guardar recuerdo" }))
    await waitFor(() =>
      expect(createMemory).toHaveBeenCalledWith({
        ticket: "t",
        caption: "El día después",
        happenedOn: "2023-07-04",
        happenedTime: null,
        shareLocation: false,
        relatedMemoryId: parent.id,
        samePlace: true,
      }),
    )
  })

  it("starts a plain contribution from the space's own control, with nothing carried over from a memory", async () => {
    listMemories.mockResolvedValue({ ok: true, memories: [parent] })
    render(<MemoriesSpace />)
    await openGlass(/La casa nueva/)
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Contribuir" }))
    const form = await screen.findByRole("dialog", { name: "Contribuir con un recuerdo" })
    fireEvent.click(within(form).getByRole("button", { name: "Cerrar" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Contribuir con un recuerdo" })).toBeNull())
    // Back at the overview the visitor opens the form from the pill: no chip, no date.
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    for (let i = 0; i < 60 && screen.queryByRole("dialog"); i++) {
      const batch = frames
      frames = []
      clock += 100
      act(() => batch.forEach((cb) => cb(clock)))
    }
    fireEvent.click(await screen.findByRole("button", { name: "Contribuir" }))
    const plain = await screen.findByRole("dialog", { name: "Contribuir con un recuerdo" })
    expect(within(plain).queryByText(/Relacionado con/)).toBeNull()
    expect((within(plain).getByLabelText("¿Cuándo fue?") as HTMLInputElement).value).toBe("")
  })
})
