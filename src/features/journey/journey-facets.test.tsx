import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/gate/actions", () => ({ checkHandle: vi.fn() }))
vi.mock("@/features/memories/actions", () => ({
  listMemories: vi.fn(),
  prepareUpload: vi.fn(),
  createMemory: vi.fn(),
  suggestPlace: vi.fn(),
  resolveMapsLink: vi.fn(),
}))
vi.mock("@/shared/analytics", () => ({ track: vi.fn() }))

// The real stars, recording the facets they are handed on every render.
const handed: unknown[] = []
vi.mock("@/features/facets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/facets")>()
  return {
    ...actual,
    FacetStars: (props: Parameters<typeof actual.FacetStars>[0]) => {
      handed.push(props.facets)
      return <actual.FacetStars {...props} />
    },
  }
})

import { PROJECT } from "@/features/projects/project-fixture"
import { Journey } from "./journey"

const PROJECTS = [PROJECT]

beforeEach(() => {
  handed.length = 0
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("Journey facets", () => {
  it("hands the stars the same facets on every render while the case studies stay the same", () => {
    render(<Journey projects={PROJECTS} mode="work" />)
    const star = screen.getByRole("button", { name: "Proyectos" })
    fireEvent.mouseEnter(star)
    fireEvent.mouseLeave(star)
    expect(handed.length).toBeGreaterThan(1)
    expect(new Set(handed).size).toBe(1)
  })

  it("derives them again when the case studies change", () => {
    const { rerender } = render(<Journey projects={PROJECTS} mode="work" />)
    rerender(<Journey projects={[...PROJECTS]} mode="work" />)
    expect(new Set(handed).size).toBe(2)
  })
})
