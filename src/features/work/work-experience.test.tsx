import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Hoisted: the wrapper calls next/dynamic while it is imported, before this file's own statements run. A plain array,
// because Vitest clears mock calls before every test.
const { dynamicOptions, journeyProps } = vi.hoisted(() => ({ dynamicOptions: [] as unknown[], journeyProps: vi.fn() }))
// The lazy journey is replaced by a stand-in that reports the options it was loaded with and the props it receives.
vi.mock("next/dynamic", () => ({
  default: (_load: unknown, options: unknown) => {
    dynamicOptions.push(options)
    return function JourneyStub(props: Record<string, unknown>) {
      journeyProps(props)
      return null
    }
  },
}))

import { PROJECT } from "@/features/projects/project-fixture"
import { WorkExperience } from "./work-experience"

const PROJECTS = [PROJECT]

afterEach(() => {
  cleanup()
  journeyProps.mockReset()
})

describe("WorkExperience", () => {
  it("loads the journey on the client only, like the story does", () => {
    expect(dynamicOptions).toEqual([expect.objectContaining({ ssr: false })])
  })

  it("renders the journey in the work mode with the case studies, and never offers the intro replay", () => {
    render(<WorkExperience projects={PROJECTS} />)
    expect(journeyProps).toHaveBeenLastCalledWith({ mode: "work", projects: PROJECTS, openProject: undefined })
  })

  it("passes a deep link through to the journey", () => {
    render(<WorkExperience projects={PROJECTS} openProject="consola" />)
    expect(journeyProps).toHaveBeenLastCalledWith({ mode: "work", projects: PROJECTS, openProject: "consola" })
  })
})
