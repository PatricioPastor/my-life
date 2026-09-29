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
