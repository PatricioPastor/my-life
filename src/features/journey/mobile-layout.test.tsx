import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FACETS, FacetPlace } from "@/features/facets"
import type { MemoryView } from "@/features/memories"
import { ContributeButton } from "@/features/memories/ui/contribute-button"
import { MemoriesPlace } from "@/features/memories/ui/memories-place"
import { PROJECT } from "@/features/projects/project-fixture"
import { CaseStudy } from "@/features/reader"
import { BAR_LEFT, BAR_RIGHT, BAR_TOP } from "@/shared/lib/top-bar"
import { BackButton } from "./back-button"
import { ReplayIntroButton } from "./replay-intro-button"

// The page draws under the notch and the home indicator (viewport-fit=cover), so anything pinned to an edge has to
// keep clear of the device insets. jsdom has no insets; what can be asserted is that each pinned control is placed
// with env(safe-area-inset-*) on the edge it sits against, or with the top bar's edge (whose tokens carry the insets,
// see top-bar.test.ts).
const BAR_EDGE = { top: BAR_TOP, left: BAR_LEFT, right: BAR_RIGHT } as const
const hasInset = (el: Element | null, edge: "top" | "bottom" | "left" | "right") =>
  !!el &&
  (el.className.includes(`env(safe-area-inset-${edge})`) ||
    (edge !== "bottom" && el.className.split(/\s+/).includes(BAR_EDGE[edge])))
const classesOf = (el: Element | null) => new Set(el?.className.split(/\s+/).filter(Boolean))
/** The space's slot for its action: the top bar's right end. */
const slotOf = (control: Element) => control.closest("[data-hud]")

beforeEach(() => {
  vi.stubGlobal("matchMedia", undefined)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const memory: MemoryView = {
  id: "a",
  caption: "El primer viaje",
  happenedOn: "2024-03-12",
  status: "approved",
  width: 800,
  height: 600,
  kind: "image",
  takenAt: null,
  dominantColor: null,
  place: null,
  orbColor: "#8ab4ff",
  viewCount: 0,

  relatedId: null,
  thumbUrl: "https://res.cloudinary.com/demo/image/upload/t/a",
  fullUrl: "https://res.cloudinary.com/demo/image/upload/f/a",
  audio: null,
}

describe("safe areas", () => {
  it("keeps the back button below the status bar and the notch", () => {
    render(<BackButton label="Universo" hint="Volver" onClick={() => {}} />)
    const box = screen.getByRole("button").parentElement
    expect(hasInset(box, "top")).toBe(true)
    expect(hasInset(box, "left")).toBe(true)
  })

  it("keeps Ver intro above the home indicator", () => {
    render(<ReplayIntroButton onClick={() => {}} />)
    expect(hasInset(screen.getByRole("button").parentElement, "bottom")).toBe(true)
  })

  it("keeps a facet's title above the home indicator and its list below the status bar", () => {
    render(<FacetPlace facet={FACETS[0]!} onOpenEntry={() => {}} />)
    expect(hasInset(screen.getByRole("heading", { level: 1 }), "bottom")).toBe(true)
    expect(hasInset(screen.getByRole("list"), "top")).toBe(true)
  })

  it("keeps the memories title above the home indicator and the Contribuir control below the status bar", () => {
    render(
      <MemoriesPlace state={{ status: "ready", memories: [memory] }} action={<button type="button">Contribuir</button>} />,
    )
    expect(hasInset(screen.getByRole("heading", { level: 1, name: "Recuerdos" }), "bottom")).toBe(true)
    const slot = slotOf(screen.getByRole("button", { name: "Contribuir" }))
    expect(hasInset(slot, "top")).toBe(true)
    expect(slot?.className).not.toMatch(/(^|\s)(max-md:)?bottom-/)
  })

  it("keeps the memories title and the add control clear of a side notch (a phone in landscape)", () => {
    render(
      <MemoriesPlace state={{ status: "ready", memories: [memory] }} action={<button type="button">Contribuir</button>} />,
    )
    expect(hasInset(screen.getByRole("heading", { level: 1, name: "Recuerdos" }), "left")).toBe(true)
    expect(hasInset(slotOf(screen.getByRole("button", { name: "Contribuir" })), "right")).toBe(true)
  })
})

describe("one top bar", () => {
  const renderBar = () =>
    render(
      <>
        <BackButton label="Universo" hint="Volver" onClick={() => {}} />
        <MemoriesPlace state={{ status: "ready", memories: [memory] }} action={<ContributeButton />} />
      </>,
    )
  const back = () => screen.getByRole("button", { name: "Universo" })
  const contribute = () => screen.getByRole("button", { name: "Contribuir" })

  it("puts the way back and Contribuir on the same line, at the same distance from the top", () => {
    renderBar()
    expect(classesOf(back().parentElement).has(BAR_TOP)).toBe(true)
    expect(classesOf(slotOf(contribute())).has(BAR_TOP)).toBe(true)
  })

  it("mirrors them: the way back as far from the left edge as Contribuir is from the right one", () => {
    renderBar()
    expect(classesOf(back().parentElement).has(BAR_LEFT)).toBe(true)
    expect(classesOf(slotOf(contribute())).has(BAR_RIGHT)).toBe(true)
  })

  it("draws them alike: the same row height, padding, type, tracking and ink", () => {
    renderBar()
    expect(classesOf(contribute())).toEqual(classesOf(back()))
  })

  it("centres both on the bar's row", () => {
    renderBar()
    const row = (el: Element | null) => classesOf(el).has("h-(--bar-row)") && classesOf(el).has("items-center")
    expect(row(back())).toBe(true)
    expect(row(contribute())).toBe(true)
    expect(row(slotOf(contribute()))).toBe(true)
  })

  it("brings them in together, with the same rise", () => {
    renderBar()
    expect(classesOf(back().parentElement).has("rise")).toBe(true)
    // The rise is inside the slot, so the slot's own fade can still step the control aside under the glass.
    const rise = contribute().closest(".rise")
    expect(rise).not.toBeNull()
    expect(slotOf(contribute())?.contains(rise)).toBe(true)
    expect(rise).not.toBe(slotOf(contribute()))
  })
})

describe("facet entries on a phone", () => {
  it("stacks a row in one column on a phone, and lays it on the six-column grid from md", () => {
    render(<FacetPlace facet={FACETS[0]!} onOpenEntry={() => {}} />)
    const row = screen.getAllByRole("button")[0]!
    const line = classesOf(row.querySelector(".shift"))
    expect(line.has("max-md:flex-col")).toBe(true)
    expect(line.has("md:grid-cols-6")).toBe(true)
  })
})

describe("case study on a phone", () => {
  it("reads in one column on the grid's left axis, with no fixed width that could overflow a 360 px screen", () => {
    const { container } = render(
      <CaseStudy meta="Diseño y desarrollo, 2026" title="Consola" stack={[{ name: "Frontend", items: [{ name: "Next.js 16", icon: "/tech/nextjs.svg" }] }]} blocks={PROJECT.blocks} />,
    )
    const article = screen.getByRole("article")
    expect(classesOf(article).has("flex-col")).toBe(true)
    expect(classesOf(article).has("pl-(--grid-left)")).toBe(true)
    expect(classesOf(article).has("pr-(--grid-right)")).toBe(true)
    for (const el of container.querySelectorAll("[class]")) {
      expect(el.getAttribute("class")).not.toMatch(/(^|\s)(min-)?w-\[\d+px\]/)
    }
  })
})

describe("facet place in a short landscape viewport", () => {
  const short = "[@media(max-height:520px)]"

  it("shrinks and lowers the large title, and starts the list below the small label, so none of them overlap", () => {
    render(<FacetPlace facet={FACETS[0]!} onOpenEntry={() => {}} />)
    const title = screen.getByRole("heading", { level: 1 }).className
    expect(title).toContain(`${short}:text-[32px]`)
    expect(title).toContain(`${short}:bottom-[calc(32px+env(safe-area-inset-bottom))]`)
    // The label sits under the bar's row (76 px down on a desktop width); the list keeps clear of it, across the grid.
    const list = screen.getByRole("list").className
    expect(list).toContain(`${short}:top-[112px]`)
    expect(list).not.toMatch(/(^|\s)\S*w-\[\d+px\]/)
    expect(screen.getAllByRole("button")[0]!.className).toContain(`${short}:min-h-[56px]`)
  })
})
