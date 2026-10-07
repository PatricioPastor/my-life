import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { StackGroup } from "@/features/projects"
import { PROJECT } from "@/features/projects/project-fixture"
import { GRID, GRID_ASIDE, GRID_CONTENT } from "@/shared/ui/grid"
import { TITLE_EASE, TITLE_FADE_IN_MS, TITLE_FADE_OUT_MS } from "@/shared/ui/place-title"
import { CaseStudy } from "./case-study"

afterEach(cleanup)

const LOGO = "/projects/consola/logo.svg"
const STACK: readonly StackGroup[] = [
  {
    name: "Frontend",
    items: [
      { name: "Next.js 16", icon: "/tech/nextjs.svg" },
      { name: "React 19", icon: "/tech/react.svg" },
    ],
  },
  { name: "Legado", items: [{ name: "Cobol" }] },
  { name: "Testing", items: [{ name: "Vitest", icon: "/tech/vitest.svg" }] },
]

const show = (logo?: string) =>
  render(<CaseStudy meta="Diseño y desarrollo, 2026" title="Consola de prueba" logo={logo} stack={STACK} blocks={PROJECT.blocks} />)

const classesOf = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)
const hasAll = (el: Element | null, classes: string) => classes.split(" ").every((c) => classesOf(el).includes(c))
const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
/** The text, as a named region the keyboard can scroll. */
const body = () => screen.getByRole("region", { name: "Consola de prueba" })
/** The two copies of the stack: the left zone's (desktop), then the one after the text (phone). */
const stacks = () => screen.getAllByRole("list", { name: "Stack" })
const aside = () => stacks()[0]!

describe("CaseStudy heading", () => {
  it("heads with the full logo in place of the title, which stays the heading's accessible name", () => {
    show(LOGO)
    const heading = screen.getByRole("heading", { level: 1, name: "Consola de prueba" })
    const logo = heading.querySelector("img")
    expect(logo?.getAttribute("src")).toBe(LOGO)
    expect(logo?.getAttribute("alt")).toBe("Consola de prueba")
    expect(heading.textContent).toBe("")
  })

  it("keeps a text title for a case study without a logo", () => {
    show()
    const heading = screen.getByRole("heading", { level: 1 })
    expect(heading.querySelector("img")).toBeNull()
    expect(heading.textContent).toBe("Consola de prueba")
  })

  it("sets the meta under the heading", () => {
    show()
    expect(follows(screen.getByRole("heading", { level: 1 }), screen.getByText("Diseño y desarrollo, 2026"))).toBe(true)
  })
})

describe("CaseStudy text", () => {
  it("reads as one continuous text: every block, in order, with no page controls", () => {
    show()
    const texts = ["Primera página,", "Una cita.", "Cómo está hecho", "Segunda página,"].map((t) => within(body()).getByText(t, { exact: false }))
    for (let i = 1; i < texts.length; i++) expect(follows(texts[i - 1]!, texts[i]!)).toBe(true)
    expect(screen.queryByRole("navigation", { name: "Páginas" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Página (anterior|siguiente)/ })).toBeNull()
    expect(screen.queryByText(/^\d+ de \d+$/)).toBeNull()
  })

  // The bug in the owner's screenshot: the paged reader kept every page in one grid cell, and two showed at once.
  it("never stacks one part of the text on another: each block once, none hidden or laid in a shared cell", () => {
    show()
    for (const text of ["Una cita.", "con fuerza"]) {
      expect(screen.getAllByText(text)).toHaveLength(1)
      for (let el: Element | null = screen.getByText(text); el && el !== body(); el = el.parentElement) {
        expect(el.getAttribute("aria-hidden")).toBeNull()
        expect(classesOf(el).some((c) => c === "invisible" || c === "turn" || c.includes("grid-area"))).toBe(false)
      }
    }
  })

  it("keeps its emphasis, quotes and subheadings, as text and never as HTML", () => {
    show()
    expect(within(body()).getByText("con énfasis").tagName).toBe("EM")
    expect(within(body()).getByText("Una cita.").tagName).toBe("BLOCKQUOTE")
    expect(within(body()).getByRole("heading", { level: 2, name: "Cómo está hecho" })).toBeTruthy()
    expect(within(body()).getByText("con fuerza").tagName).toBe("STRONG")
  })

  it("marks each break as a faint hairline between two sections", () => {
    show()
    const breaks = within(body()).getAllByRole("separator")
    expect(breaks).toHaveLength(PROJECT.blocks.filter((b) => b.type === "break").length)
    expect(follows(within(body()).getByText("Una cita."), breaks[0]!)).toBe(true)
    expect(follows(breaks[0]!, within(body()).getByRole("heading", { level: 2 }))).toBe(true)
    expect(classesOf(breaks[0]!).some((c) => c.startsWith("bg-ink-faint/"))).toBe(true)
  })

  it("keeps the text to a comfortable measure", () => {
    show()
    const measure = classesOf(body()).map((c) => /^max-w-\[(\d+)ch\]$/.exec(c)?.[1]).find(Boolean)
    expect(Number(measure)).toBeGreaterThanOrEqual(60)
    expect(Number(measure)).toBeLessThanOrEqual(72)
  })

  it("scrolls in one panel the keyboard can reach: the text is focusable and named after the case study", () => {
    show()
    expect(body().tabIndex).toBe(0)
    const scroller = body().closest(`[class~="overflow-y-auto"]`)
    expect(scroller).not.toBeNull()
    expect(scroller?.contains(aside())).toBe(true)
  })
})

describe("CaseStudy grid", () => {
  it("draws no guides: the grid is an invisible reference the text lines up on", () => {
    const { container } = show()
    // What the guides were: decoration hidden from assistive tech, a copy of the grid with a hairline on each column edge.
    const guides = [...container.querySelectorAll("[aria-hidden='true'], [aria-hidden='true'] *")].filter(
      (el) => hasAll(el, GRID) || classesOf(el).includes("border-l"),
    )
    expect(guides).toEqual([])
  })

  it("puts the logo, meta and stack in the left zone, sticky, and the text in the content zone", () => {
    show()
    const left = screen.getByRole("heading", { level: 1 }).parentElement
    expect(hasAll(left, `${GRID_ASIDE} md:sticky`)).toBe(true)
    expect(left?.contains(screen.getByText("Diseño y desarrollo, 2026"))).toBe(true)
    expect(left?.contains(aside())).toBe(true)
    expect(hasAll(body(), GRID_CONTENT)).toBe(true)
    expect(hasAll(left?.parentElement ?? null, GRID)).toBe(true)
  })
})

describe("CaseStudy stack", () => {
  const category = (name: string) => within(aside()).getByRole("button", { name })
  const panelOf = (button: HTMLElement) => document.getElementById(button.getAttribute("aria-controls")!)!
  /** A category's technologies, as the chips its panel shows. */
  const chipsOf = (button: HTMLElement) => within(panelOf(button)).getByRole("list", { name: button.textContent! })
  const chipNames = (button: HTMLElement) => within(chipsOf(button)).getAllByRole("listitem").map((li) => li.textContent)

  it("heads the stack with its label, then one disclosure per category, in the order given", () => {
    show()
    expect(screen.getAllByRole("heading", { level: 2, name: "Stack" })).toHaveLength(2)
    expect(within(aside()).getAllByRole("button").map((b) => b.textContent)).toEqual(["Frontend", "Legado", "Testing"])
  })

  it("starts with every category closed, showing only its label", () => {
    show()
    for (const button of within(aside()).getAllByRole("button")) {
      expect(button.getAttribute("aria-expanded")).toBe("false")
      expect(panelOf(button).getAttribute("data-open")).toBe("false")
    }
    expect(within(aside()).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Frontend", "Legado", "Testing"])
  })

  // R4-001: every isotype was fetched up front, though the reader may open none.
  it("loads no isotype until its category is opened", () => {
    show()
    for (const list of stacks()) expect(list.querySelectorAll("img")).toHaveLength(0)
    fireEvent.click(category("Testing"))
    expect(panelOf(category("Frontend")).querySelector("img")).toBeNull()
    expect(panelOf(category("Testing")).querySelector("img")?.getAttribute("src")).toBe("/tech/vitest.svg")
  })

  it("opens a category onto its technologies as chips, each its isotype and its name, in the order given", () => {
    show()
    const frontend = category("Frontend")
    fireEvent.click(frontend)
    expect(frontend.getAttribute("aria-expanded")).toBe("true")
    expect(panelOf(frontend).getAttribute("data-open")).toBe("true")
    expect(chipNames(frontend)).toEqual(["Next.js 16", "React 19"])
    const chips = within(chipsOf(frontend)).getAllByRole("listitem")
    // Decoration: the name beside it already says what it is.
    expect(chips.map((chip) => [chip.querySelector("img")?.getAttribute("src"), chip.querySelector("img")?.getAttribute("alt")])).toEqual([
      ["/tech/nextjs.svg", ""],
      ["/tech/react.svg", ""],
    ])
  })

  it("keeps each isotype small, at its own aspect ratio", () => {
    show()
    fireEvent.click(category("Frontend"))
    const icon = panelOf(category("Frontend")).querySelector("img")
    expect(classesOf(icon)).toContain("w-auto")
    expect(classesOf(icon).some((c) => /^h-(5|6)$/.test(c))).toBe(true)
  })

  it("lays the chips in a row that wraps, with one gap between them", () => {
    show()
    fireEvent.click(category("Frontend"))
    expect(hasAll(chipsOf(category("Frontend")), "flex flex-wrap")).toBe(true)
    expect(classesOf(chipsOf(category("Frontend"))).some((c) => /^gap-\d+$/.test(c))).toBe(true)
  })

  it("shows a technology with no isotype by its name alone", () => {
    show()
    fireEvent.click(category("Legado"))
    expect(chipNames(category("Legado"))).toEqual(["Cobol"])
    expect(panelOf(category("Legado")).querySelector("img")).toBeNull()
  })

  it("never makes a technology a control, nor gives it a hover hint: the categories are the only buttons", () => {
    show()
    for (const name of ["Frontend", "Legado", "Testing"]) fireEvent.click(category(name))
    expect(within(aside()).getAllByRole("button").map((b) => b.textContent)).toEqual(["Frontend", "Legado", "Testing"])
    for (const list of stacks()) expect(list.querySelector("[data-cursor-label]")).toBeNull()
  })

  it("closes a category again, its chips kept so the close can animate", () => {
    show()
    const frontend = category("Frontend")
    fireEvent.click(frontend)
    fireEvent.click(frontend)
    expect(frontend.getAttribute("aria-expanded")).toBe("false")
    expect(panelOf(frontend).getAttribute("data-open")).toBe("false")
    expect(panelOf(frontend).querySelectorAll("img")).toHaveLength(2)
  })

  it("lets several stay open at once", () => {
    show()
    fireEvent.click(category("Frontend"))
    fireEvent.click(category("Testing"))
    expect(category("Frontend").getAttribute("aria-expanded")).toBe("true")
    expect(category("Testing").getAttribute("aria-expanded")).toBe("true")
  })

  it("keeps the phone's copy of the stack in step, with ids of its own", () => {
    show()
    fireEvent.click(category("Testing"))
    const phone = within(stacks()[1]!).getByRole("button", { name: "Testing" })
    expect(phone.getAttribute("aria-expanded")).toBe("true")
    expect(chipNames(phone)).toEqual(["Vitest"])
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("CaseStudy on a phone", () => {
  it("stacks one column: the logo, the meta, the text, then the stack", () => {
    show()
    const [left, end] = stacks()
    expect(classesOf(left!.closest("section"))).toContain("max-md:hidden")
    expect(classesOf(end!.closest("section"))).toContain("md:hidden")
    const order = [screen.getByRole("heading", { level: 1 }), screen.getByText("Diseño y desarrollo, 2026"), body(), end!]
    for (let i = 1; i < order.length; i++) expect(follows(order[i - 1]!, order[i]!)).toBe(true)
  })
})

describe("a category's reveal", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")
  /** The body of every `@media (prefers-reduced-motion: reduce)` block, nested braces included. */
  const reducedBlocks = () => {
    const blocks: string[] = []
    for (let at = css.indexOf("@media (prefers-reduced-motion: reduce)"); at >= 0; at = css.indexOf("@media (prefers-reduced-motion: reduce)", at + 1)) {
      let depth = 0
      let i = css.indexOf("{", at)
      const start = i
      do {
        if (css[i] === "{") depth++
        else if (css[i] === "}") depth--
        i++
      } while (depth > 0 && i < css.length)
      blocks.push(css.slice(start, i))
    }
    return blocks
  }

  it("grows open on the interface's ease-out, and closes faster", () => {
    const open = /\.tech-reveal\[data-open="true"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? ""
    const closed = /\.tech-reveal\s*\{([^}]*)\}/.exec(css)?.[1] ?? ""
    expect(open).toContain(`grid-template-rows ${TITLE_FADE_IN_MS}ms ${TITLE_EASE}`)
    expect(open).toMatch(new RegExp(`opacity ${TITLE_FADE_IN_MS}ms`))
    expect(closed).toContain(`grid-template-rows ${TITLE_FADE_OUT_MS}ms ${TITLE_EASE}`)
    expect(closed).toMatch(new RegExp(`opacity ${TITLE_FADE_OUT_MS}ms`))
  })

  it("shows and hides at once under reduced motion", () => {
    const rule = reducedBlocks().find((b) => b.includes(".tech-reveal"))
    expect(rule).toMatch(/\.tech-reveal[^{]*\{\s*transition: none;/)
  })
})
