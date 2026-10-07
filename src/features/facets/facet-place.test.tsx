import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { STAR_HEX } from "@/shared/lib/palette"
import { GRID, GRID_ASIDE, GRID_CONTENT, GRID_X } from "@/shared/ui/grid"
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
  it("puts the meta in the left zone, and the full logo then the summary in the content zone", () => {
    show()
    const button = row(/^Consola/)
    expect(hasAll(button.querySelector(".shift"), GRID)).toBe(true)
    expect(hasAll(screen.getByText("Diseño y desarrollo, 2026"), GRID_ASIDE)).toBe(true)
    const logo = button.querySelector("img")!
    expect(logo.getAttribute("src")).toBe("/projects/consola/logo.svg")
    expect(logo.getAttribute("alt")).toBe("Consola")
    const content = logo.closest(`[class~="md:col-start-3"]`)
    expect(hasAll(content, GRID_CONTENT)).toBe(true)
    // Two halves of the content zone with the shared gutter: the logo on the third guide, the summary on the fifth.
    expect(hasAll(content, "md:grid md:grid-cols-2 md:gap-x-(--grid-gap)")).toBe(true)
    expect(content?.contains(screen.getByText("Una consola para vigilar una flota."))).toBe(true)
  })

  it("names a row by the project and its summary, and describes it with its meta", () => {
    show()
    const button = row(/^Consola Una consola para vigilar una flota\.$/)
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toBe("Diseño y desarrollo, 2026")
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

  it("lets a title with no summary run across the content zone", () => {
    show()
    expect(classesOf(screen.getByText("Otra consola").parentElement)).toContain("md:col-span-2")
  })

  it("keeps a placeholder facet's entries on the same grid, each named by its title", () => {
    show(FACETS[0]!)
    const buttons = screen.getAllByRole("button", { name: "[Título de la historia]" })
    expect(buttons).toHaveLength(3)
    expect(hasAll(buttons[0]!.querySelector(".shift"), GRID)).toBe(true)
    expect(buttons[0]!.querySelector("img")).toBeNull()
  })

  it("stacks a row on a phone: the meta, then the logo over the summary, in one column", () => {
    show()
    const line = row(/^Consola/).querySelector(".shift")!
    expect(classesOf(line)).toContain("max-md:flex-col")
    const content = line.querySelector(`[class~="md:col-start-3"]`)
    expect(classesOf(content)).toContain("flex-col")
    const order = [screen.getByText("Diseño y desarrollo, 2026"), line.querySelector("img")!, screen.getByText(/^Una consola/)]
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })
})

function hexToRgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}
