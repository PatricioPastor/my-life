import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { STAR_HEX } from "@/shared/lib/palette"
import { GRID, GRID_X } from "@/shared/ui/grid"
import { TITLE_EASE, TITLE_FADE_OUT_MS, TITLE_HOLD_MS, TITLE_LABEL, TITLE_SHRINK_MS } from "@/shared/ui/place-title"
import { FACETS, findFacet, type Facet } from "./content"
import { FacetPlace } from "./facet-place"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  // Here rather than at the end of a test, so a test that fails before its end cannot leak the stub (R3-001).
  delete (HTMLElement.prototype as { animate?: unknown }).animate
})

/** jsdom has no Web Animations: the title's FLIP calls this stub instead, which afterEach removes. */
const stubAnimate = () => {
  const animate = vi.fn()
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate })
  return animate
}

const PROYECTOS: Facet = {
  ...findFacet("projects", FACETS)!,
  entries: [
    {
      meta: "Diseño y desarrollo, 2026",
      title: "Consola",
      summary: "Una consola para vigilar una flota.",
      logo: "/projects/consola/logo.svg",
      mark: "/projects/consola/mark.svg",
    },
    { meta: "Desarrollo, 2025", title: "Otra consola", mark: "/projects/otra/mark.svg" },
  ],
}

const show = (facet: Facet = PROYECTOS) => render(<FacetPlace facet={facet} onOpenEntry={() => {}} />)
const title = () => screen.getByRole("heading", { level: 1 })
const classesOf = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)
const hasAll = (el: Element | null, classes: string) => classes.split(" ").every((c) => classesOf(el).includes(c))
const row = (name: RegExp) => screen.getByRole("button", { name })
const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

describe("FacetPlace title", () => {
  it("arrives large, in the facet's pixel face and star color, then shrinks into the label under the way back", () => {
    vi.useFakeTimers()
    show()
    expect(title().getAttribute("data-title")).toBe("hero")
    expect(classesOf(title())).toContain("font-display")
    expect(title().style.color).toBe(hexToRgb(STAR_HEX[PROYECTOS.color]))
    act(() => vi.advanceTimersByTime(TITLE_HOLD_MS - 50))
    expect(title().getAttribute("data-title")).toBe("hero")
    act(() => vi.advanceTimersByTime(100))
    expect(title().getAttribute("data-title")).toBe("label")
    expect(hasAll(title(), TITLE_LABEL)).toBe(true)
    // The same glyphs in both states, so the FLIP scales the word it started from.
    expect(classesOf(title())).toContain("font-display")
  })

  it("hangs the large title on the grid's first column too", () => {
    show()
    expect(classesOf(title())).toContain("left-[calc(var(--grid-left)-var(--title-bearing))]")
  })

  it("shrinks with a FLIP: the label starts where the large title was, at its size, on the interface's ease-out", () => {
    vi.useFakeTimers()
    const animate = stubAnimate()
    const boxes = { hero: new DOMRect(51, 700, 900, 130), label: new DOMRect(51, 76, 150, 25) }
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const mode = this.getAttribute("data-title") as "hero" | "label" | null
      return mode ? boxes[mode] : new DOMRect()
    })
    show()
    act(() => vi.advanceTimersByTime(TITLE_HOLD_MS + 10))
    expect(animate).toHaveBeenCalledTimes(1)
    const [frames, options] = animate.mock.calls[0]
    expect(frames[0].transform).toBe("translate(0px, 624px) scale(6)")
    expect(frames.at(-1).transform).toBe("none")
    expect(options).toMatchObject({ duration: TITLE_SHRINK_MS, easing: TITLE_EASE })
  })

  it("crossfades into the label under reduced motion: no travel, no transform", () => {
    vi.useFakeTimers()
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    const animate = stubAnimate()
    show()
    act(() => vi.advanceTimersByTime(TITLE_HOLD_MS + 10))
    expect(title().getAttribute("data-fading")).toBe("true")
    expect(title().getAttribute("data-title")).toBe("hero")
    act(() => vi.advanceTimersByTime(TITLE_FADE_OUT_MS + 10))
    expect(title().getAttribute("data-title")).toBe("label")
    expect(animate).not.toHaveBeenCalled()
  })
})

// R3-001: a FLIP test that fails half way must not leave its stub to the tests after it. The first test fails on
// purpose (it.fails) after stubbing; the second must find no stub.
describe("FacetPlace title's animate stub", () => {
  it.fails("is stubbed by a test that then fails before its end", () => {
    stubAnimate()
    expect("a FLIP assertion").toBe("failing")
  })

  it("is gone by the next test", () => {
    expect(Object.hasOwn(HTMLElement.prototype, "animate")).toBe(false)
  })
})

describe("FacetPlace grid", () => {
  it("draws no guides: the grid is an invisible reference the rows line up on", () => {
    const { container } = show()
    // What the guides were: decoration hidden from assistive tech, a copy of the grid with a hairline on each column edge.
    const guides = [...container.querySelectorAll("[aria-hidden='true'], [aria-hidden='true'] *")].filter(
      (el) => hasAll(el, GRID) || classesOf(el).includes("border-l"),
    )
    expect(guides).toEqual([])
  })

  it("lays the list between the grid's insets: the rows start on the axis the small title hangs from", () => {
    show()
    expect(hasAll(screen.getByRole("list"), GRID_X)).toBe(true)
  })
})

describe("FacetPlace rows", () => {
  /** What a row lays on the list's columns: its name (the logo, or the title), then its summary. */
  const cellsOf = (button: HTMLElement) => [...button.querySelector(".shift")!.children]

  // The owner's screenshot: the meta on the first guide, the logo on the third, the summary on the fifth, "MUY
  // desequilibrado". The meta goes; the logo and the summary read as one line from the axis.
  it("leaves the meta out of the list: the case study still gives it", () => {
    show()
    expect(screen.queryByText("Diseño y desarrollo, 2026")).toBeNull()
    expect(screen.queryByText("Desarrollo, 2025")).toBeNull()
  })

  it("names a row by the project and its summary, and describes it with nothing more", () => {
    show()
    const button = row(/^Consola Una consola para vigilar una flota\.$/)
    expect(button.hasAttribute("aria-describedby")).toBe(false)
  })

  it("puts the full logo first and the summary after it, a fixed gap between them", () => {
    show()
    const [name, summary] = cellsOf(row(/^Consola/))
    const logo = name!.querySelector("img")!
    expect(logo.getAttribute("src")).toBe("/projects/consola/logo.svg")
    expect(logo.getAttribute("alt")).toBe("Consola")
    expect(summary!.textContent).toBe("Una consola para vigilar una flota.")
    expect(classesOf(summary!)).toContain("md:pl-(--space-4)")
    // On one line from md, as one line of type: the summary sits on the logo's baseline (an image's is its foot).
    expect(classesOf(row(/^Consola/).querySelector(".shift"))).toContain("md:items-baseline")
  })

  it("starts every summary at one x from md: the list's first column is its widest logo, every row on the list's columns", () => {
    show()
    const list = screen.getByRole("list")
    expect(hasAll(list, "md:grid md:grid-cols-[max-content_minmax(0,max-content)]")).toBe(true)
    // The item, the button and the line that shifts on hover each pass the list's two columns down to the next.
    const button = row(/^Consola/)
    for (const el of [button.closest("li"), button, button.querySelector(".shift")]) {
      expect(hasAll(el, "md:col-span-2 md:grid md:grid-cols-subgrid")).toBe(true)
    }
    // The gap is the summary's own, so a list with no summary has no empty column after its names.
    expect(classesOf(list).some((c) => /^(?:md:)?gap-(?!y-)/.test(c))).toBe(false)
  })

  // The cursor's frame and the focus ring follow the button's box: it must end where the row's content does.
  it("hugs a row's content: neither the list's columns nor the button stretch across the list's width", () => {
    show()
    expect(classesOf(screen.getByRole("list")).some((c) => c.includes("fr"))).toBe(false)
    const button = row(/^Consola/)
    expect(classesOf(button)).not.toContain("w-full")
    expect(hasAll(button.querySelector(".shift"), GRID)).toBe(false)
  })

  it("sizes the logo with restraint and never wider than its column", () => {
    show()
    const logo = row(/^Consola/).querySelector("img")!
    for (const c of ["h-6", "md:h-7", "w-auto", "max-w-full"]) expect(classesOf(logo)).toContain(c)
  })

  it("falls back to the title text with no logo, its mark beside it as decoration", () => {
    show()
    const button = row(/^Otra consola$/)
    const mark = button.querySelector("img")!
    expect(mark.getAttribute("src")).toBe("/projects/otra/mark.svg")
    expect(mark.getAttribute("alt")).toBe("")
    expect(screen.getByText("Otra consola").contains(mark)).toBe(true)
  })

  it("keeps a title with no logo in the first column, where the logos go", () => {
    show()
    const [name, ...rest] = cellsOf(row(/^Otra consola$/))
    expect(name!.textContent).toBe("Otra consola")
    expect(rest).toEqual([])
    expect(classesOf(name!).some((c) => c.includes("col-span"))).toBe(false)
  })

  it("keeps a placeholder facet's entries on the same columns, each named by its title", () => {
    show(FACETS[0]!)
    const buttons = screen.getAllByRole("button", { name: "[Título de la historia]" })
    expect(buttons).toHaveLength(3)
    expect(hasAll(buttons[0]!.querySelector(".shift"), "md:grid md:grid-cols-subgrid")).toBe(true)
    expect(buttons[0]!.querySelector("img")).toBeNull()
  })

  it("stacks a row on a phone: the logo over the summary, both on the axis, the row across the column", () => {
    show()
    const button = row(/^Consola/)
    expect(classesOf(button)).toContain("max-md:w-full")
    const line = button.querySelector(".shift")!
    expect(hasAll(line, "max-md:flex-col")).toBe(true)
    const [name, summary] = cellsOf(button)
    expect(follows(name!, summary!)).toBe(true)
    // The gap before the summary is a desktop one: on a phone it starts on the axis, under the logo.
    expect(classesOf(summary!).some((c) => /^(?:max-md:)?-?[pm][xlsre]?-/.test(c))).toBe(false)
  })
})

function hexToRgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}
