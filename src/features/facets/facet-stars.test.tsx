import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FACETS } from "./content"
import { FacetStars } from "./facet-stars"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setup(width = 1280) {
  vi.stubGlobal("innerWidth", width)
  render(<FacetStars facets={FACETS} hovered={null} sky={{ current: null }} onHover={() => {}} onOpen={() => {}} />)
}

describe("FacetStars", () => {
  it("describes each star with its facet description without changing its name", () => {
    setup()
    for (const f of FACETS) {
      const button = screen.getByRole("button", { name: f.name })
      const id = button.getAttribute("aria-describedby")!
      expect(document.getElementById(id)?.textContent).toBe(f.description)
    }
  })

  it("marks each star as a strong magnetic target carrying its cursor context", () => {
    setup()
    const button = screen.getByRole("button", { name: "Proyectos" })
    expect(button.dataset.magnetic).toBe("strong")
    expect(button.dataset.cursorLabel).toBe("Proyectos")
    expect(button.dataset.cursorContext).toBe("Cosas que construí y estoy construyendo.")
  })

  it("flips a label to the left of its star when it would overflow at 390px", () => {
    setup(390)
    const label = screen.getByRole("button", { name: "Proyectos" }).querySelector("span")!
    expect(label.className).toContain("right-11")
    expect(label.className).not.toContain("left-11")
    const historias = screen.getByRole("button", { name: "Historias" }).querySelector("span")!
    expect(historias.className).toContain("left-11")
  })

  it("keeps every label on the right on a desktop viewport", () => {
    setup(1440)
    for (const f of FACETS) {
      expect(screen.getByRole("button", { name: f.name }).querySelector("span")?.className).toContain("left-11")
    }
  })
})
