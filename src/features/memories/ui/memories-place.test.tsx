import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { Memory } from "../memory"
import { MemoriesPlace } from "./memories-place"

afterEach(cleanup)

const memory = (id: string, caption: string): Memory => ({
  id,
  handle: "ana",
  publicId: `p/${id}`,
  caption,
  happenedOn: new Date("2026-05-01T00:00:00.000Z"),
  width: 800,
  height: 600,
  status: "approved",
  createdAt: new Date("2026-05-02T00:00:00.000Z"),
})

describe("MemoriesPlace", () => {
  it("is titled Recuerdos", () => {
    render(<MemoriesPlace memories={[]} />)
    expect(screen.getByRole("heading", { level: 1, name: "Recuerdos" })).toBeTruthy()
  })

  it("shows the empty state when there are no memories", () => {
    render(<MemoriesPlace memories={[]} />)
    expect(screen.getByText("Todavía no hay recuerdos.")).toBeTruthy()
  })

  it("hands the floor to the memories list when there is one", () => {
    render(<MemoriesPlace memories={[memory("a", "El primer viaje"), memory("b", "Una tarde de lluvia")]} />)
    expect(screen.queryByText("Todavía no hay recuerdos.")).toBeNull()
    const list = screen.getByRole("list", { name: "Recuerdos" })
    expect(list.querySelectorAll("li")).toHaveLength(2)
    expect(screen.getByText("El primer viaje")).toBeTruthy()
  })

  it("renders no controls of its own: the journey owns the way back", () => {
    render(<MemoriesPlace memories={[]} />)
    expect(screen.queryByRole("button")).toBeNull()
  })
})
