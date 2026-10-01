import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FACETS, FacetPlace } from "@/features/facets"
import type { MemoryView } from "@/features/memories"
import { MemoriesPlace } from "@/features/memories/ui/memories-place"
import { BackButton } from "./back-button"
import { ReplayIntroButton } from "./replay-intro-button"

// The page draws under the notch and the home indicator (viewport-fit=cover), so anything pinned to an edge has to
// keep clear of the device insets. jsdom has no insets; what can be asserted is that each pinned control is placed
// with env(safe-area-inset-*) on the edge it sits against.
const hasInset = (el: Element | null, edge: "top" | "bottom" | "left") =>
  !!el && el.className.includes(`env(safe-area-inset-${edge})`)

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
  thumbUrl: "https://res.cloudinary.com/demo/image/upload/t/a",
  fullUrl: "https://res.cloudinary.com/demo/image/upload/f/a",
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
    render(<FacetPlace facet={FACETS[0]!} listSide="left" onOpenEntry={() => {}} />)
    expect(hasInset(screen.getByRole("heading", { level: 1 }), "bottom")).toBe(true)
    expect(hasInset(screen.getByRole("list"), "top")).toBe(true)
  })

  it("keeps the memories title and the add control above the home indicator", () => {
    render(
      <MemoriesPlace state={{ status: "ready", memories: [memory] }} action={<button type="button">Agregar recuerdo</button>} />,
    )
    expect(hasInset(screen.getByRole("heading", { level: 1, name: "Recuerdos" }), "bottom")).toBe(true)
    expect(hasInset(screen.getByRole("button", { name: "Agregar recuerdo" }).parentElement, "bottom")).toBe(true)
  })
})

describe("facet entries on a phone", () => {
  it("stacks the meta over the title instead of spending a third of the width on a side column", () => {
    render(<FacetPlace facet={FACETS[0]!} listSide="left" onOpenEntry={() => {}} />)
    const row = screen.getAllByRole("button")[0]!
    const line = row.querySelector(".shift") as HTMLElement
    expect(line.className).toContain("max-md:flex-col")
    expect(line.firstElementChild?.className).toContain("max-md:w-auto")
  })
})

describe("facet place in a short landscape viewport", () => {
  const short = "[@media(max-height:520px)]"

  it("shrinks the title and tightens the list so the two never overlap", () => {
    render(<FacetPlace facet={FACETS[0]!} listSide="right" onOpenEntry={() => {}} />)
    expect(screen.getByRole("heading", { level: 1 }).className).toContain(`${short}:text-[32px]`)
    const list = screen.getByRole("list")
    expect(list.className).toContain(`${short}:top-[76px]`)
    expect(list.className).toContain(`${short}:w-[440px]`)
    expect(screen.getAllByRole("button")[0]!.className).toContain(`${short}:min-h-[56px]`)
  })
})
