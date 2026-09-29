import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Reader, READER_PAGES } from "./reader"

afterEach(cleanup)

const setup = (page: number) => {
  const handlers = { onPrev: vi.fn(), onNext: vi.fn() }
  render(<Reader meta="[Year]" title="[Story title]" page={page} {...handlers} />)
  return handlers
}

describe("Reader", () => {
  it("has three placeholder pages", () => {
    expect(READER_PAGES).toHaveLength(3)
  })

  it("shows the first page with the previous button disabled", () => {
    setup(0)
    expect(screen.getByText("[Opening paragraph of the piece]")).toBeTruthy()
    expect(screen.getByText("1 of 3")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("shows the last page with the next button disabled", () => {
    setup(2)
    expect(screen.getByText("[Closing paragraph]")).toBeTruthy()
    expect(screen.getByText("3 of 3")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("reports page turns", () => {
    const h = setup(1)
    fireEvent.click(screen.getByRole("button", { name: "Next page" }))
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }))
    expect(h.onNext).toHaveBeenCalledTimes(1)
    expect(h.onPrev).toHaveBeenCalledTimes(1)
  })

  it("renders the entry meta and title", () => {
    setup(0)
    expect(screen.getByText("[Year]")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "[Story title]" })).toBeTruthy()
  })
})
