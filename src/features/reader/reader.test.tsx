import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Reader, READER_PAGES } from "./reader"

afterEach(cleanup)

const setup = (page: number) => {
  const handlers = { onPrev: vi.fn(), onNext: vi.fn() }
  render(<Reader meta="[Año]" title="[Título de la historia]" page={page} {...handlers} />)
  return handlers
}

describe("Reader", () => {
  it("has three placeholder pages", () => {
    expect(READER_PAGES).toHaveLength(3)
  })

  it("shows the first page with the previous button disabled", () => {
    setup(0)
    expect(screen.getByText("[Párrafo inicial]")).toBeTruthy()
    expect(screen.getByText("1 de 3")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Página anterior" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Página siguiente" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("shows the last page with the next button disabled", () => {
    setup(2)
    expect(screen.getByText("[Párrafo final]")).toBeTruthy()
    expect(screen.getByText("3 de 3")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Página siguiente" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("reports page turns", () => {
    const h = setup(1)
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }))
    fireEvent.click(screen.getByRole("button", { name: "Página anterior" }))
    expect(h.onNext).toHaveBeenCalledTimes(1)
    expect(h.onPrev).toHaveBeenCalledTimes(1)
  })

  it("renders the entry meta and title", () => {
    setup(0)
    expect(screen.getByText("[Año]")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "[Título de la historia]" })).toBeTruthy()
  })
})

describe("Reader in a short landscape viewport", () => {
  const short = "[@media(max-height:520px)]"

  it("compacts the title and the page so the whole entry fits a phone turned sideways", () => {
    const { container } = render(<Reader meta="2024" title="Una historia" page={0} onPrev={() => {}} onNext={() => {}} />)
    expect(screen.getByRole("heading", { level: 1 }).className).toContain(`${short}:text-[28px]`)
    const body = container.querySelector(".turn")?.parentElement as HTMLElement
    expect(body.className).toContain(`${short}:h-[150px]`)
    expect(body.className).toContain(`${short}:text-[18px]`)
  })
})
