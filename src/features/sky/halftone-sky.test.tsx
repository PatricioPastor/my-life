import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { HalftoneSky } from "./halftone-sky"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("HalftoneSky", () => {
  it("shows the gradient fallback when WebGL2 is unavailable", () => {
    // jsdom has no WebGL: getContext returns null.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    render(<HalftoneSky preset="solar" />)
    expect(screen.getByTestId("sky-fallback")).toBeTruthy()
  })

  it("defaults to the ember sky", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    render(<HalftoneSky />)
    // jsdom drops the gradients it cannot parse and keeps the void the fallback ends on.
    const bg = screen.getByTestId("sky-fallback").getAttribute("style") ?? ""
    expect(bg).toContain("rgb(10, 6, 0)")
    expect(bg).not.toContain("rgb(25, 25, 35)")
  })

  it("renders its children inside the stage", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    render(
      <HalftoneSky>
        <button type="button">Stories</button>
      </HalftoneSky>,
    )
    expect(screen.getByRole("button", { name: "Stories" })).toBeTruthy()
  })
})
