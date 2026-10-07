import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PROJECT } from "@/features/projects/project-fixture"
import { GRID, GRID_ASIDE, GRID_CONTENT } from "@/shared/ui/grid"
import { TITLE_EASE, TITLE_FADE_IN_MS, TITLE_FADE_OUT_MS } from "@/shared/ui/place-title"
import { CaseStudy, type CaseStudyTech } from "./case-study"

afterEach(cleanup)

const LOGO = "/projects/consola/logo.svg"
const STACK: readonly CaseStudyTech[] = [
  { name: "Next.js 16", icon: "/tech/nextjs.svg" },
  { name: "React 19", icon: "/tech/react.svg" },
  { name: "Cobol" },
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
  const item = (name: string) => within(aside()).getByRole("button", { name })
  const panelOf = (button: HTMLElement) => document.getElementById(button.getAttribute("aria-controls")!)

  it("lists one item per technology, in the order given", () => {
    show()
    expect(within(aside()).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Next.js 16", "React 19", "Cobol"])
  })

  it("opens an item to reveal the technology's isotype, and closes it again", () => {
    show()
    const next = item("Next.js 16")
    const panel = panelOf(next)
    expect(next.getAttribute("aria-expanded")).toBe("false")
    expect(panel?.getAttribute("data-open")).toBe("false")
    fireEvent.click(next)
    expect(next.getAttribute("aria-expanded")).toBe("true")
    expect(panel?.getAttribute("data-open")).toBe("true")
    // Decoration: the name beside it already says what it is.
    const icon = panel?.querySelector("img")
    expect(icon?.getAttribute("src")).toBe("/tech/nextjs.svg")
    expect(icon?.getAttribute("alt")).toBe("")
    fireEvent.click(next)
    expect(next.getAttribute("aria-expanded")).toBe("false")
    expect(panel?.getAttribute("data-open")).toBe("false")
  })

  it("keeps the isotype at its own aspect ratio, at a fixed height", () => {
    show()
    const icon = panelOf(item("React 19"))?.querySelector("img")
    expect(classesOf(icon ?? null)).toContain("w-auto")
    expect(classesOf(icon ?? null).some((c) => /^h-(10|11|12)$/.test(c))).toBe(true)
  })

  it("lets several stay open at once", () => {
    show()
    fireEvent.click(item("Next.js 16"))
    fireEvent.click(item("React 19"))
    expect(item("Next.js 16").getAttribute("aria-expanded")).toBe("true")
    expect(item("React 19").getAttribute("aria-expanded")).toBe("true")
  })

  it("shows a name with no isotype as plain text, never as a control", () => {
    show()
    expect(screen.queryByRole("button", { name: "Cobol" })).toBeNull()
    expect(within(aside()).getByText("Cobol").closest("button")).toBeNull()
  })

  it("keeps the phone's copy of the list in step, with ids of its own", () => {
    show()
    fireEvent.click(item("React 19"))
    const phone = within(stacks()[1]!).getByRole("button", { name: "React 19" })
    expect(phone.getAttribute("aria-expanded")).toBe("true")
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

describe("the isotype's reveal", () => {
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
