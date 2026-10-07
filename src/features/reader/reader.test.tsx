import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { pagesOf } from "./pages"
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
    expect(screen.getByText("[Párrafo inicial]").closest(".turn")).not.toBeNull()
    expect(screen.getByText("1 de 3")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Página anterior" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Página siguiente" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("shows the last page with the next button disabled", () => {
    setup(2)
    expect(screen.getByText("[Párrafo final]").closest(".turn")).not.toBeNull()
    expect(screen.getByText("[Párrafo inicial]").closest(".turn")).toBeNull()
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

  it("sets no details for a placeholder entry", () => {
    setup(0)
    expect(screen.queryByRole("term")).toBeNull()
  })
})

describe("Reader with a real entry", () => {
  const PAGES = pagesOf([
    {
      type: "paragraph",
      runs: [
        { kind: "text", text: "Primera página, " },
        { kind: "em", text: "con énfasis" },
        { kind: "text", text: "." },
      ],
    },
    { type: "quote", runs: [{ kind: "text", text: "Una cita." }] },
    { type: "break" },
    { type: "subheading", text: "Cómo está hecho" },
    {
      type: "paragraph",
      runs: [
        { kind: "text", text: "Segunda página <b>sin HTML</b>, " },
        { kind: "strong", text: "con fuerza" },
        { kind: "text", text: "." },
      ],
    },
  ])
  const DETAILS = [{ label: "Stack", value: "Next.js 16 · React 19" }]
  const show = (page: number) =>
    render(<Reader meta="Diseño y desarrollo, 2026" title="Consola" details={DETAILS} pages={PAGES} page={page} onPrev={() => {}} onNext={() => {}} />)
  /** The page a piece of text sits on, or null when it is out of reach of assistive tech. */
  const visiblePage = (text: string) => screen.getByText(text).closest(".turn, [aria-hidden='true']")

  it("reads the entry's own pages instead of the placeholders", () => {
    show(0)
    expect(screen.getByText("1 de 2")).toBeTruthy()
    expect(screen.queryByText("[Párrafo inicial]")).toBeNull()
  })

  it("renders its emphasis, quotes and subheadings as plain text, never as HTML", () => {
    const { container } = show(1)
    expect(screen.getByText("con énfasis").tagName).toBe("EM")
    expect(screen.getByText("Una cita.").tagName).toBe("BLOCKQUOTE")
    expect(screen.getByRole("heading", { level: 2, name: "Cómo está hecho" })).toBeTruthy()
    // Spectral ships only its 400: strong keeps the weight instead of a faux bold, as in the intro reader.
    expect(screen.getByText("con fuerza").tagName).toBe("STRONG")
    expect(screen.getByText("con fuerza").className).toContain("font-normal")
    expect(container.querySelector("b")).toBeNull()
    expect(screen.getByText(/sin HTML/).textContent).toContain("<b>sin HTML</b>")
  })

  it("shows the current page and keeps the others out of reach, so turning never moves the controls", () => {
    show(0)
    expect(visiblePage("Una cita.")?.className).toContain("turn")
    expect(visiblePage("con fuerza")?.getAttribute("aria-hidden")).toBe("true")
    cleanup()
    show(1)
    expect(visiblePage("con fuerza")?.className).toContain("turn")
    expect(visiblePage("Una cita.")?.getAttribute("aria-hidden")).toBe("true")
    expect(screen.getByText("2 de 2")).toBeTruthy()
  })

  it("sets the entry's details quietly under its title", () => {
    show(0)
    expect(screen.getByRole("term").textContent).toBe("Stack")
    expect(screen.getByRole("definition").textContent).toBe("Next.js 16 · React 19")
    const title = screen.getByRole("heading", { level: 1 })
    expect(title.compareDocumentPosition(screen.getByRole("term")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe("Reader with a logo", () => {
  const LOGO = "/projects/consola/logo.svg"
  const show = (logo?: string) =>
    render(<Reader meta="Diseño y desarrollo, 2026" title="Consola" logo={logo} page={0} onPrev={() => {}} onNext={() => {}} />)

  it("heads the entry with its logo in place of the title, which stays the heading's accessible name", () => {
    show(LOGO)
    const heading = screen.getByRole("heading", { level: 1, name: "Consola" })
    const logo = heading.querySelector("img")
    expect(logo?.getAttribute("src")).toBe(LOGO)
    expect(logo?.getAttribute("alt")).toBe("Consola")
    expect(heading.textContent).toBe("")
  })

  it("sizes the logo to the title's type, inside the same heading, so the details, the pages and the controls keep their places", () => {
    show()
    const textTitle = screen.getByRole("heading", { level: 1 }).className
    cleanup()
    show(LOGO)
    const heading = screen.getByRole("heading", { level: 1 })
    expect(heading.className).toBe(textTitle)
    expect(heading.querySelector("img")?.className).toMatch(/\bh-\[[\d.]+em\]/)
  })

  it("keeps a text title for an entry without a logo", () => {
    show()
    expect(screen.getByRole("heading", { level: 1 }).querySelector("img")).toBeNull()
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Consola")
  })
})

describe("Reader in a short landscape viewport", () => {
  const short = "[@media(max-height:520px)]"

  it("compacts the title and the page so the whole entry fits a phone turned sideways", () => {
    const { container } = render(<Reader meta="2024" title="Una historia" page={0} onPrev={() => {}} onNext={() => {}} />)
    expect(screen.getByRole("heading", { level: 1 }).className).toContain(`${short}:text-[28px]`)
    const body = container.querySelector(".turn")?.parentElement as HTMLElement
    expect(body.className).toContain(`${short}:min-h-[150px]`)
    expect(body.className).toContain(`${short}:text-[18px]`)
  })
})
