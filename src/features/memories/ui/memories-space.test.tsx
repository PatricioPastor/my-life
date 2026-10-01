import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import { MemoriesSpace } from "./memories-space"

const listMemories = vi.fn()
const prepareUpload = vi.fn()
const createMemory = vi.fn()
const uploadToCloudinary = vi.fn()
vi.mock("../actions", () => ({
  listMemories: () => listMemories(),
  prepareUpload: () => prepareUpload(),
  createMemory: (input: unknown) => createMemory(input),
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
  thumbUrl: `https://res.cloudinary.com/demo/t/${id}`,
  fullUrl: `https://res.cloudinary.com/demo/f/${id}`,
  ...over,
})

beforeEach(() => {
  vi.stubGlobal("matchMedia", undefined)
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }))
  prepareUpload.mockResolvedValue({ ok: true, upload: { cloudName: "demo", ticket: "t", fields: {} } })
  uploadToCloudinary.mockResolvedValue({ ok: true })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe("MemoriesSpace adding a memory", () => {
  it("offers Agregar recuerdo once the memories are ready, even when there are none", async () => {
    listMemories.mockResolvedValue({ ok: true, memories: [] })
    render(<MemoriesSpace />)
    expect(await screen.findByRole("button", { name: "Agregar recuerdo" })).toBeTruthy()
  })

  it.each(["no_session", "unavailable"] as const)("does not offer it when loading failed (%s)", async (reason) => {
    listMemories.mockResolvedValue({ ok: false, reason })
    render(<MemoriesSpace />)
    await screen.findByRole("status")
    expect(screen.queryByRole("button", { name: "Agregar recuerdo" })).toBeNull()
  })

  it("appends the saved memory as a pending orb and leaves the others where they are", async () => {
    listMemories.mockResolvedValue({ ok: true, memories: [view("a", "El primer viaje")] })
    const saved = view("new", "Una tarde de lluvia", { status: "pending" })
    createMemory.mockResolvedValue({ ok: true, memory: saved })
    render(<MemoriesSpace />)
    await screen.findByRole("button", { name: /El primer viaje/ })
    const before = screen.getByRole("button", { name: /El primer viaje/ }).getAttribute("style")

    fireEvent.click(screen.getByRole("button", { name: "Agregar recuerdo" }))
    fireEvent.change(screen.getByLabelText("Foto"), { target: { files: [new File(["x"], "f.jpg", { type: "image/jpeg" })] } })
    fireEvent.change(screen.getByLabelText("¿Qué recuerdas?"), { target: { value: "Una tarde de lluvia" } })
    fireEvent.change(screen.getByLabelText("¿Cuándo fue?"), { target: { value: "2024-03-12" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar recuerdo" }))

    await waitFor(() => expect(createMemory).toHaveBeenCalledWith({ ticket: "t", caption: "Una tarde de lluvia", happenedOn: "2024-03-12" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 3000 })
    const orb = screen.getByRole("button", { name: /Una tarde de lluvia.*pendiente/i })
    expect(orb.getAttribute("data-pending")).toBe("true")
    expect(screen.getByRole("button", { name: /El primer viaje/ }).getAttribute("style")).toBe(before)
  })
})
