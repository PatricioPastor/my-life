import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { FACETS, findFacet, type Facet } from "./content"
import { FacetPlace } from "./facet-place"

afterEach(cleanup)

const PROYECTOS: Facet = {
  ...findFacet("projects", FACETS)!,
  entries: [
    { meta: "Diseño y desarrollo, 2026", title: "Consola", mark: "/projects/consola/mark.svg" },
    { meta: "Desarrollo, 2025", title: "Otra consola" },
  ],
}

const show = () => render(<FacetPlace facet={PROYECTOS} listSide="right" onOpenEntry={() => {}} />)

describe("FacetPlace", () => {
  it("sets an entry's mark beside its name, as decoration: the entry still reads as its meta and name", () => {
    show()
    const button = screen.getByRole("button", { name: /Consola$/ })
    const mark = button.querySelector("img")
    expect(mark?.getAttribute("src")).toBe("/projects/consola/mark.svg")
    expect(mark?.getAttribute("alt")).toBe("")
    expect(screen.getByText("Consola").contains(mark)).toBe(true)
    expect(button.textContent).toBe("Diseño y desarrollo, 2026Consola")
  })

  it("keeps an entry without a mark as text only", () => {
    show()
    expect(screen.getByRole("button", { name: /Otra consola$/ }).querySelector("img")).toBeNull()
  })
})
