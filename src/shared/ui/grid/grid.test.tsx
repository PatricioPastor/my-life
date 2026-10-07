import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { BAR_TITLE } from "@/shared/lib/top-bar"
import { GRID, GRID_ASIDE, GRID_CONTENT, GRID_X, GridGuides } from "."

afterEach(cleanup)

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")
const token = (name: string) => {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css)
  if (!m) throw new Error(`token --${name} not found`)
  return m[1].trim()
}
const classesOf = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)

describe("the place grid", () => {
  it("is one column on a phone and six equal ones from md, with the shared gutter", () => {
    expect(GRID.split(" ")).toEqual(["md:grid", "md:grid-cols-6", "md:gap-x-(--grid-gap)"])
    expect(token("grid-gap")).toMatch(/^var\(--space-\d+\)$/)
  })

  it("splits into a left zone (columns 1–2) and a content zone (columns 3–6)", () => {
    expect(GRID_ASIDE.split(" ")).toEqual(["md:col-start-1", "md:col-span-2"])
    expect(GRID_CONTENT.split(" ")).toEqual(["md:col-start-3", "md:col-span-4"])
  })

  it("starts its first column on the back chevron's ink: the axis a place's label hangs from", () => {
    expect(GRID_X).toBe("left-(--grid-left) right-(--grid-right)")
    expect(token("grid-left")).toBe("calc(var(--bar-left) + var(--bar-pad) + var(--bar-ink))")
    // The label sits on that same sum, less only its first letter's side bearing.
    expect(BAR_TITLE).toContain("left-[calc(var(--bar-left)+var(--bar-pad)+var(--bar-ink)-var(--title-bearing))]")
  })

  it("mirrors the right inset on the left one, each against its own notch", () => {
    expect(token("grid-right")).toBe(token("grid-left").replace("--bar-left", "--bar-right"))
  })
})

describe("GridGuides", () => {
  const guides = () => render(<GridGuides />).container.firstElementChild!

  it("is decoration only: hidden from assistive tech and from the pointer", () => {
    const el = guides()
    expect(el.getAttribute("aria-hidden")).toBe("true")
    expect(classesOf(el)).toContain("pointer-events-none")
  })

  it("draws nothing on a phone", () => {
    expect(classesOf(guides())).toContain("max-md:hidden")
  })

  it("lays its six columns on the place grid itself, so content lines up on the guides exactly", () => {
    const el = guides()
    for (const c of [...GRID.split(" "), ...GRID_X.split(" ")]) expect(classesOf(el)).toContain(c)
    expect(el.children).toHaveLength(6)
  })

  it("draws a faint hairline on every column edge, both ends included", () => {
    const columns = [...guides().children]
    for (const column of columns) {
      expect(classesOf(column)).toContain("border-l")
      expect(classesOf(column)).toContain("border-ink-faint/40")
    }
    expect(classesOf(columns.at(-1)!)).toContain("border-r")
    expect(columns.slice(0, -1).some((c) => classesOf(c).includes("border-r"))).toBe(false)
  })
})
