import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FACETS, workFacets } from "./content"
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

describe("FacetStars with stars turned off", () => {
  const OFF = ["Historias", "Escritos", "Ahora"]

  function setupWork() {
    const onHover = vi.fn()
    const onOpen = vi.fn()
    render(<FacetStars facets={workFacets(FACETS)} hovered={null} sky={{ current: null }} onHover={onHover} onOpen={onOpen} />)
    return { onHover, onOpen }
  }

  it("offers only the lit star: the off ones are not buttons, and nothing else can take focus", () => {
    setupWork()
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Proyectos"])
    for (const name of OFF) expect(screen.queryByRole("button", { name })).toBeNull()
    expect(document.querySelectorAll("[tabindex]")).toHaveLength(0)
  })

  it("still draws the off stars' names, faint, and keeps them out of the accessibility tree", () => {
    setupWork()
    for (const name of OFF) {
      const label = screen.getByText(name)
      expect(label.className).toContain("text-ink-faint")
      expect(label.closest("[aria-hidden='true']")).not.toBeNull()
      expect(document.getElementById(`facet-${FACETS.find((f) => f.name === name)!.id}-description`)).toBeNull()
    }
  })

  it("gives the cursor nothing to capture on an off star, and ignores a press or a hover on it", () => {
    const { onHover, onOpen } = setupWork()
    for (const name of OFF) {
      const star = screen.getByText(name).closest("[aria-hidden='true']") as HTMLElement
      expect(star.closest("[data-magnetic]")).toBeNull()
      expect(star.querySelector("[data-magnetic], [data-cursor-id]")).toBeNull()
      expect(star.className).toContain("pointer-events-none")
      fireEvent.click(star)
      fireEvent.mouseEnter(star)
    }
    expect(onOpen).not.toHaveBeenCalled()
    expect(onHover).not.toHaveBeenCalled()
  })

  it("keeps the lit star exactly as in the story", () => {
    const { onOpen } = setupWork()
    const button = screen.getByRole("button", { name: "Proyectos" })
    expect(button.dataset.magnetic).toBe("strong")
    expect(button.dataset.cursorId).toBe("projects")
    fireEvent.click(button)
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "projects" }))
  })
})
