import { readFileSync } from "node:fs"
import { join } from "node:path"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { StackGroup } from "@/features/projects"
import { PROJECT } from "@/features/projects/project-fixture"
import type { Block } from "@/shared/content"
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

const SUMMARY = "Una consola para probar."

const show = (logo?: string, summary?: string) =>
  render(<CaseStudy meta="Diseño y desarrollo, 2026" title="Consola de prueba" summary={summary} logo={logo} stack={STACK} blocks={PROJECT.blocks} />)

const classesOf = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)
const hasAll = (el: Element | null, classes: string) => classes.split(" ").every((c) => classesOf(el).includes(c))
const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
/** A horizontal padding or margin, at any width: it would move a control's text off the column's axis. */
const INSET = (c: string) => /^(?:[a-z0-9-]+:)*-?[pm][xlsre]?-/.test(c)
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

  it("keeps the panel's width whether or not it has a scrollbar, so the grid never shifts", () => {
    show()
    expect(classesOf(body().closest(`[class~="overflow-y-auto"]`))).toContain("[scrollbar-gutter:stable]")
  })
})

describe("CaseStudy headline", () => {
  let reduced = false
  beforeEach(() => {
    reduced = false
    // A frame runs at once; the reduced-motion preference is whatever the test sets.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal("cancelAnimationFrame", () => {})
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  const panel = () => body().closest<HTMLElement>(`[class~="overflow-y-auto"]`)!
  const headline = () => screen.getByRole("heading", { level: 2, name: SUMMARY })
  /** The compact line: the headline's words again, hidden from assistive tech. */
  const compactLine = () => [...document.querySelectorAll<HTMLElement>("p[aria-hidden='true']")].find((p) => p.textContent === SUMMARY)!
  const rect = (top: number) => ({ top, bottom: top + 10, left: 0, right: 0, width: 0, height: 10, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
  /**
   * Lays the panel out as a browser would once it has scrolled `scrolled` px: the compact line holds still at 76 px, and
   * the headline, which starts `from` px down (76 on a desktop, under the logo and meta on a phone), rises with the text.
   */
  const scrollTo = (scrolled: number, from = 76) => {
    vi.spyOn(compactLine(), "getBoundingClientRect").mockReturnValue(rect(76))
    vi.spyOn(headline(), "getBoundingClientRect").mockReturnValue(rect(from - scrolled))
    panel().scrollTop = scrolled
    fireEvent.scroll(panel())
  }
  const progress = () => panel().style.getPropertyValue("--headline")

  it("heads the text with the summary, an h2 under the logo's h1, large and in the narrative face", () => {
    show(LOGO, SUMMARY)
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(follows(screen.getByRole("heading", { level: 1 }), headline())).toBe(true)
    expect(follows(headline(), within(body()).getByText("Primera página,", { exact: false }))).toBe(true)
    expect(classesOf(headline())).toContain("font-narrative")
    expect(classesOf(headline()).some((c) => /^text-\[clamp\(/.test(c))).toBe(true)
  })

  it("has no headline when the case study has no summary", () => {
    show()
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).not.toContain(SUMMARY)
  })

  it("starts large, with the compact line out of sight", () => {
    show(LOGO, SUMMARY)
    expect(panel().dataset.headline).toBe("large")
    expect(progress()).toBe("0")
  })

  it("shrinks it smoothly as the panel scrolls past it", () => {
    show(LOGO, SUMMARY)
    scrollTo(80)
    expect(Number(progress())).toBeCloseTo(0.5)
    expect(panel().dataset.headline).toBe("large")
  })

  it("holds the compact line once the headline has scrolled past, and gives it back at the top", () => {
    show(LOGO, SUMMARY)
    scrollTo(400)
    expect(progress()).toBe("1")
    expect(panel().dataset.headline).toBe("compact")
    scrollTo(0)
    expect(progress()).toBe("0")
    expect(panel().dataset.headline).toBe("large")
  })

  it("only starts once the headline reaches the bar, wherever it starts (a phone sets it under the logo)", () => {
    show(LOGO, SUMMARY)
    scrollTo(90, 176)
    expect(progress()).toBe("0")
    scrollTo(180, 176)
    expect(Number(progress())).toBeCloseTo(0.5)
  })

  it("under reduced motion, switches between the two at once, with nothing in between", () => {
    reduced = true
    show(LOGO, SUMMARY)
    scrollTo(40)
    expect(progress()).toBe("0")
    scrollTo(100)
    expect(progress()).toBe("1")
    expect(panel().dataset.headline).toBe("compact")
  })

  it("keeps the compact line out of the outline: the headline stays the one heading with its words", () => {
    show(LOGO, SUMMARY)
    expect(screen.getAllByRole("heading", { name: SUMMARY })).toHaveLength(1)
    expect(compactLine()).toBeDefined()
    expect(classesOf(compactLine())).toContain("truncate")
  })

  it("covers the way back's row across the panel, so the text never shows under it", () => {
    show(LOGO, SUMMARY)
    const bar = compactLine().closest<HTMLElement>(`[class~="sticky"]`)!
    expect(hasAll(bar, "sticky top-0")).toBe(true)
    expect(panel().contains(bar)).toBe(true)
    const cap = [...bar.querySelectorAll("div")].find((el) => hasAll(el, "inset-x-0 top-0 h-(--case-top)"))
    expect(classesOf(cap!).some((c) => c.includes("var(--void)"))).toBe(true)
  })

  describe("the backdrop under its compact line", () => {
    /** The first capture of `pattern` among an element's classes, as a number. */
    const valueOf = (el: Element | null, pattern: RegExp) => Number(classesOf(el).map((c) => pattern.exec(c)?.[1]).find(Boolean))
    /** The layers of the backdrop the compact line sits on, in the content zone (the whole column on a phone). */
    const layers = () => [...compactLine().parentElement!.querySelectorAll(".case-bar")]
    /** How far a layer reaches below --case-top, in rem. */
    const depthOf = (layer: Element) => valueOf(layer, /^h-\[calc\(var\(--case-top\)\+([\d.]+)rem\)\]$/)
    /** The layer reaching furthest down: the one over the text. */
    const band = () => layers().reduce((a, b) => (depthOf(b) > depthOf(a) ? b : a))
    const depth = () => depthOf(band())
    /** How long its fade to nothing is, at its foot, in rem. */
    const fade = () => valueOf(band(), /calc\(100%_-_([\d.]+)rem\)/)

    it("hides the text scrolling under the compact line: solid for a body line beneath it, then a short fade", () => {
      show(LOGO, SUMMARY)
      const line = valueOf(compactLine(), /^h-(\d+)$/) / 4
      // The text's largest size (a desktop's) at its leading, in rem: the height of one of its lines.
      const sizes = classesOf(body()).map((c) => /^(?:md:)?text-\[(\d+)px\]$/.exec(c)?.[1]).filter(Boolean).map(Number)
      const bodyLine = (Math.max(...sizes) * valueOf(body(), /^leading-\[([\d.]+)\]$/)) / 16
      expect(depth() - line - fade()).toBeGreaterThanOrEqual(bodyLine)
      expect(fade() * 16).toBeGreaterThanOrEqual(24)
      expect(fade() * 16).toBeLessThanOrEqual(32)
    })

    it("lands a section's heading after a jump clear of it, on the text's own anchor", () => {
      show(LOGO, SUMMARY)
      expect(classesOf(body())).toContain("[&>h2]:scroll-mt-(--case-land)")
      expect(valueOf(panel(), /^\[--case-land:calc\(var\(--case-top\)\+([\d.]+)rem\)\]$/)).toBeGreaterThan(depth())
    })

    // The index is drawn in the text's layer, under the bar: a backdrop over its column would hide it.
    it("leaves the index where it holds: from xl, what reaches down to it stops at the text's column", () => {
      render(<CaseStudy meta="m" title="Consola de prueba" summary={SUMMARY} stack={STACK} blocks={[{ type: "subheading", text: "Uno" }]} />)
      const index = screen.getByRole("navigation", { name: "Índice" })
      expect(hasAll(index, "xl:top-(--case-anchor) xl:col-start-4")).toBe(true)
      // Where the index holds, below --case-top: the compact line's 2rem, then --space-3 (24px).
      const anchor = 2 + 24 / 16
      const deep = layers().filter((layer) => depthOf(layer) > anchor)
      expect(deep).toContain(band())
      // Its right edge, from xl, one column and one gap in from the content zone's: the index's.
      for (const layer of deep) expect(classesOf(layer)).toContain("xl:right-[calc((100%-3*var(--grid-gap))/4+var(--grid-gap))]")
      expect(layers().some((layer) => depthOf(layer) <= anchor && !classesOf(layer).some((c) => c.startsWith("xl:right-")))).toBe(true)
    })
  })

  describe("its motion", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")
    const rule = (name: string) => new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ""
    /** The opacity a rule gives at progress p, evaluating its `clamp(0, calc((var(--headline, 0) - a) / b), 1)` form. */
    const opacityAt = (name: string, p: number) => {
      const expr = /opacity: clamp\(0, calc\((.+)\), 1\);/.exec(rule(name))?.[1] ?? "NaN"
      const value = Number(Function(`"use strict"; return (${expr.replaceAll("var(--headline, 0)", String(p))})`)())
      return Math.min(1, Math.max(0, value))
    }

    it("reserves the headline's place: only its transform and opacity follow the scroll", () => {
      expect(rule("case-headline")).toMatch(/transform: scale\(calc\(1 - [\d.]+ \* var\(--headline, 0\)\)\)/)
      expect(rule("case-headline")).not.toMatch(/(^|\s)(height|font-size|margin|padding)/)
    })

    it("lets the headline go before its compact line comes in, so the two never show at once", () => {
      expect(opacityAt("case-headline", 0)).toBe(1)
      expect(opacityAt("case-line", 0)).toBe(0)
      const gone = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].find((p) => opacityAt("case-headline", p) === 0)!
      expect(opacityAt("case-line", gone)).toBe(0)
      expect(opacityAt("case-line", 1)).toBe(1)
    })

    it("has the backdrop opaque before the compact line shows on it", () => {
      expect(opacityAt("case-bar", 0)).toBe(0)
      const shows = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].find((p) => opacityAt("case-line", p) >= 0.5)!
      expect(opacityAt("case-bar", shows)).toBe(1)
    })
  })
})

describe("CaseStudy index", () => {
  /** An intro, then three sections, one title used twice. */
  const BLOCKS: readonly Block[] = [
    { type: "paragraph", runs: [{ kind: "text", text: "La intro." }] },
    { type: "break" },
    { type: "subheading", text: "El problema" },
    { type: "paragraph", runs: [{ kind: "text", text: "Uno." }] },
    { type: "break" },
    { type: "subheading", text: "Dónde está hoy" },
    { type: "paragraph", runs: [{ kind: "text", text: "Dos." }] },
    { type: "break" },
    { type: "subheading", text: "El problema" },
    { type: "paragraph", runs: [{ kind: "text", text: "Tres." }] },
  ]
  const IDS = ["el-problema", "donde-esta-hoy", "el-problema-2"]

  /** A stand-in for the browser's observer: it records what is observed, and reports what a test says has scrolled by. */
  class FakeObserver {
    static last: FakeObserver
    observed: Element[] = []
    constructor(
      readonly callback: IntersectionObserverCallback,
      readonly options?: IntersectionObserverInit,
    ) {
      FakeObserver.last = this
    }
    observe(el: Element) {
      this.observed.push(el)
    }
    unobserve() {}
    disconnect() {
      this.observed = []
    }
    takeRecords() {
      return []
    }
    /**
     * Reports the headings in `passed` as risen above the line under the bar, and the rest as below it. The watched area
     * is everything above that line, however far: a heading in it has risen past the line.
     */
    report(passed: string[]) {
      const entries = this.observed.map((target) => ({ target, isIntersecting: passed.includes(target.id) }))
      act(() => this.callback(entries as unknown as IntersectionObserverEntry[], this as unknown as IntersectionObserver))
    }
  }

  /** A stand-in for the browser's resize observer: it records what is watched, and a test says when that changed size. */
  class FakeResizeObserver {
    static last: FakeResizeObserver | undefined
    observed: Element[] = []
    constructor(readonly callback: ResizeObserverCallback) {
      FakeResizeObserver.last = this
    }
    observe(el: Element) {
      this.observed.push(el)
    }
    unobserve() {}
    disconnect() {
      this.observed = []
    }
    resize() {
      act(() => this.callback([], this as unknown as ResizeObserver))
    }
  }

  let reduced = false
  beforeEach(() => {
    reduced = false
    FakeResizeObserver.last = undefined
    vi.stubGlobal("IntersectionObserver", FakeObserver)
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  const showSections = () =>
    render(<CaseStudy meta="Diseño y desarrollo, 2026" title="Consola de prueba" summary={SUMMARY} stack={STACK} blocks={BLOCKS} />)
  const index = () => screen.getByRole("navigation", { name: "Índice" })
  const entries = () => within(index()).getAllByRole("link")
  const current = () => entries().filter((a) => a.getAttribute("aria-current") === "location").map((a) => a.textContent)
  const headings = () => within(body()).getAllByRole("heading", { level: 2 })
  const panel = () => body().closest<HTMLElement>(`[class~="overflow-y-auto"]`)!

  it("lists every section of the text, in order, by its own title", () => {
    showSections()
    expect(entries().map((a) => a.textContent)).toEqual(["El problema", "Dónde está hoy", "El problema"])
    expect(headings().map((h) => h.textContent)).toEqual(["El problema", "Dónde está hoy", "El problema"])
  })

  it("sizes each entry to its title, so the cursor's frame hugs the words, never the column's width", () => {
    showSections()
    for (const entry of entries()) {
      expect(classesOf(entry)).toContain("w-fit")
      expect(classesOf(entry).some(INSET)).toBe(false)
      // Its padding, not its width, gives it a hit area at least 32px tall.
      expect(hasAll(entry, "min-h-8 py-1.5")).toBe(true)
    }
  })

  it("sizes each section's heading to its words too, so the focus a jump leaves there rings the words alone", () => {
    showSections()
    expect(classesOf(body())).toContain("[&>h2]:w-fit")
  })

  it("links each entry to its heading, by an id that is readable, unique and the same on every render", () => {
    const { rerender } = showSections()
    expect(headings().map((h) => h.id)).toEqual(IDS)
    expect(entries().map((a) => a.getAttribute("href"))).toEqual(IDS.map((id) => `#${id}`))
    rerender(<CaseStudy meta="Diseño y desarrollo, 2026" title="Consola de prueba" summary={SUMMARY} stack={STACK} blocks={BLOCKS} />)
    expect(headings().map((h) => h.id)).toEqual(IDS)
    // Focusable from a script only, so a jump can move focus there; never a tab stop.
    for (const h of headings()) expect(h.tabIndex).toBe(-1)
  })

  it("jumps to a section: scrolls the panel smoothly to it, under the bar, and moves focus to its heading without a second scroll", () => {
    showSections()
    const scrollTo = vi.fn()
    panel().scrollTo = scrollTo
    panel().scrollTop = 100
    const heading = document.getElementById("donde-esta-hoy")!
    heading.style.scrollMarginTop = "132px"
    vi.spyOn(heading, "getBoundingClientRect").mockReturnValue({ top: 700 } as DOMRect)
    vi.spyOn(panel(), "getBoundingClientRect").mockReturnValue({ top: 0 } as DOMRect)
    const focus = vi.spyOn(heading, "focus")
    const click = fireEvent.click(entries()[1]!)
    expect(click).toBe(false) // the jump is the panel's, not the document's
    expect(scrollTo).toHaveBeenCalledWith({ top: 700 + 100 - 132, behavior: "smooth" })
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(document.activeElement).toBe(heading)
  })

  it("jumps at once under reduced motion", () => {
    reduced = true
    showSections()
    const scrollTo = vi.fn()
    panel().scrollTo = scrollTo
    fireEvent.click(entries()[0]!)
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }))
  })

  it("watches the headings within the panel, over everything above a line under the bar", () => {
    showSections()
    expect(FakeObserver.last.options?.root).toBe(panel())
    expect(FakeObserver.last.observed.map((el) => el.id)).toEqual(IDS)
    // Reaching far above the panel, so a heading that leaps past the line in one jump still counts as risen.
    const [top, , bottom] = (FakeObserver.last.options?.rootMargin ?? "").split(" ").map((m) => parseFloat(m))
    expect(top).toBeGreaterThanOrEqual(10000)
    expect(bottom).toBeLessThanOrEqual(48)
  })

  it("moves that line with the panel when the panel alone changes size, and stops watching it once gone", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver)
    const { unmount } = showSections()
    const bottom = () => parseFloat((FakeObserver.last.options?.rootMargin ?? "").split(" ")[2]!)
    const resizes = FakeResizeObserver.last!
    expect(resizes.observed).toEqual([panel()])
    Object.defineProperty(panel(), "clientHeight", { configurable: true, value: 900 })
    resizes.resize()
    expect(bottom()).toBe(48 - 900)
    Object.defineProperty(panel(), "clientHeight", { configurable: true, value: 600 })
    resizes.resize()
    expect(bottom()).toBe(48 - 600)
    expect(FakeObserver.last.observed.map((el) => el.id)).toEqual(IDS)
    unmount()
    expect(resizes.observed).toEqual([])
  })

  it("finds its headings within its own panel, though another case study on the page uses the same ids", () => {
    showSections()
    showSections()
    const [, second] = screen.getAllByRole("region", { name: "Consola de prueba" }).map((r) => r.closest<HTMLElement>(`[class~="overflow-y-auto"]`)!)
    // The second index watches the second panel's headings, never the first's.
    expect(FakeObserver.last.options?.root).toBe(second)
    expect(FakeObserver.last.observed.map((h) => second!.contains(h))).toEqual([true, true, true])
    // A jump from the second index lands in the second panel.
    second!.scrollTo = vi.fn()
    const [, nav] = screen.getAllByRole("navigation", { name: "Índice" })
    fireEvent.click(within(nav!).getAllByRole("link")[1]!)
    expect(second!.scrollTo).toHaveBeenCalled()
    expect(document.activeElement).toBe(within(second!).getByRole("heading", { level: 2, name: "Dónde está hoy" }))
  })

  it("marks nothing while the intro is read, before the first section", () => {
    showSections()
    FakeObserver.last.report([])
    expect(current()).toEqual([])
  })

  it("marks the section being read, one at a time, as the text scrolls both ways", () => {
    showSections()
    FakeObserver.last.report(["el-problema"])
    expect(current()).toEqual(["El problema"])
    expect(entries()[0]!.getAttribute("aria-current")).toBe("location")
    FakeObserver.last.report(["el-problema", "donde-esta-hoy"])
    expect(current()).toEqual(["Dónde está hoy"])
    FakeObserver.last.report(["el-problema"])
    expect(current()).toEqual(["El problema"])
  })

  it("marks the last section once the panel reaches its end, though its heading cannot rise that far", () => {
    showSections()
    FakeObserver.last.report(["el-problema", "donde-esta-hoy"])
    Object.defineProperty(panel(), "scrollHeight", { configurable: true, value: 2000 })
    Object.defineProperty(panel(), "clientHeight", { configurable: true, value: 900 })
    panel().scrollTop = 1100
    fireEvent.scroll(panel())
    expect(current()).toEqual(["El problema"])
    expect(entries()[2]!.getAttribute("aria-current")).toBe("location")
  })

  it("keeps the chosen entry marked while the panel travels to it, until the reader scrolls on their own", () => {
    showSections()
    panel().scrollTo = vi.fn()
    fireEvent.click(entries()[1]!)
    expect(current()).toEqual(["Dónde está hoy"])
    FakeObserver.last.report(["el-problema"])
    expect(current()).toEqual(["Dónde está hoy"])
    fireEvent.wheel(panel())
    expect(current()).toEqual(["El problema"])
  })

  it("sits in the sixth column from xl, the text in the three before it; below that, and on a phone, it is hidden", () => {
    showSections()
    expect(hasAll(index(), "hidden xl:block xl:sticky xl:self-start")).toBe(true)
    expect(hasAll(body().parentElement, "xl:col-span-3")).toBe(true)
    expect(hasAll(body().parentElement!.parentElement, `${GRID_CONTENT} xl:grid xl:grid-cols-4`)).toBe(true)
    expect(classesOf(index()).some((c) => c.startsWith("xl:col-start-"))).toBe(true)
  })

  it("has no index when the text has no sections", () => {
    render(<CaseStudy meta="m" title="Consola de prueba" stack={STACK} blocks={[{ type: "paragraph", runs: [{ kind: "text", text: "Solo." }] }]} />)
    expect(screen.queryByRole("navigation", { name: "Índice" })).toBeNull()
  })
})

describe("CaseStudy narrative font", () => {
  const SWITZER = "https://api.fontshare.com/v2/css?f[]=switzer@1,2&display=swap"
  const headLink = (selector: string) => document.head.querySelector<HTMLLinkElement>(selector)

  it("loads Switzer from Fontshare's stylesheet, hoisted into the head, never from a file of its own", () => {
    show()
    const sheet = headLink(`link[rel="stylesheet"][href="${SWITZER}"]`)
    expect(sheet).not.toBeNull()
    expect(sheet?.getAttribute("data-precedence")).toBeTruthy()
  })

  it("opens the connections to Fontshare early: the stylesheet's host plain, the font host for CORS", () => {
    show()
    expect(headLink(`link[rel="preconnect"][href="https://api.fontshare.com"]:not([crossorigin])`)).not.toBeNull()
    expect(headLink(`link[rel="preconnect"][href="https://cdn.fontshare.com"][crossorigin]`)).not.toBeNull()
  })

  it("sets the text in the narrative face, and keeps the pixel face for its labels", () => {
    show()
    expect(classesOf(body())).toContain("font-narrative")
    expect(classesOf(body())).not.toContain("font-serif")
    // The quote inherits the narrative face; the subheading stays a small label.
    expect(classesOf(within(body()).getByText("Una cita.")).some((c) => c.startsWith("font-"))).toBe(false)
    expect(classesOf(within(body()).getByRole("heading", { level: 2 }))).toContain("font-sans")
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
    // The content zone holds the text's column (the headline and the text) and, from xl, the index.
    expect(hasAll(body().parentElement!.parentElement, GRID_CONTENT)).toBe(true)
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

  // The owner's screenshot: the frame around "INFRAESTRUCTURA" spanned the whole left zone, the word a fraction of it.
  it("sizes each category to its name, so the cursor's frame and the focus ring hug the word, never the zone's width", () => {
    show()
    for (const list of stacks()) {
      for (const button of within(list).getAllByRole("button")) {
        expect(classesOf(button)).not.toContain("w-full")
        expect(classesOf(button)).toContain("w-fit")
      }
    }
  })

  it("keeps a category's hit area at least 32px tall, on a phone too, and its name on the column's axis", () => {
    show()
    for (const list of stacks()) {
      for (const button of within(list).getAllByRole("button")) {
        const height = classesOf(button).map((c) => /^min-h-(\d+)$/.exec(c)?.[1]).find(Boolean)
        expect(Number(height) * 4).toBeGreaterThanOrEqual(32)
        expect(classesOf(button).some((c) => /^max-md:min-h-/.test(c))).toBe(false)
        expect(classesOf(button).some(INSET)).toBe(false)
      }
    }
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
