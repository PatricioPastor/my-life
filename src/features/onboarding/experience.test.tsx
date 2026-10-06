import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const track = vi.fn()
const journeyMounts = vi.fn()
const journeyProjects = vi.fn()
const push = vi.fn()
vi.mock("@/shared/analytics", () => ({ track: (...a: unknown[]) => track(...a) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch: () => {} }) }))
vi.mock("@/features/sky/warm-up", () => ({ warmUpSky: () => {} }))
vi.mock("./gpu-probe", () => ({ probeRenderer: () => ({ webgl2: true, renderer: "Apple M2" }) }))
vi.mock("./idle", () => ({ whenIdle: () => () => {} }))
vi.mock("./font", () => ({
  FONT_WAIT_MS: 800,
  loadGambarino: () => Promise.resolve(),
  fontReadyOrTimeout: () => Promise.resolve("ready"),
}))
vi.mock("@/features/cursor", () => ({ MagneticCursor: () => null }))
// The lazy journey is replaced by a stand-in that exposes the replay control, counts its mounts and reports its projects.
vi.mock("next/dynamic", async () => {
  const React = await import("react")
  return {
    default: () =>
      function JourneyStub({ onReplayIntro, projects }: { onReplayIntro?: () => void; projects?: unknown }) {
        React.useEffect(() => {
          journeyMounts()
        }, [])
        journeyProjects(projects)
        return onReplayIntro ? (
          <button type="button" onClick={onReplayIntro}>
            Ver intro
          </button>
        ) : null
      },
  }
})

import { PROJECT } from "@/features/projects/project-fixture"
import { Experience } from "./experience"
import { STORY } from "./story-fixture"

const PROJECTS = [PROJECT]

const phase = () => document.querySelector(".ob")?.getAttribute("data-phase")
const SEEN = "my-life:onboarding:v1"

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  window.history.replaceState(null, "", "/")
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  track.mockReset()
  push.mockReset()
  journeyMounts.mockReset()
  journeyProjects.mockReset()
})

async function advance(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms))
}

/** From the start, through the greeting (a first visit's lasts 3.2 s), to the choice. */
async function toChoice() {
  await advance(0)
  expect(phase()).toBe("greeting")
  await advance(3300)
  expect(phase()).toBe("choice")
}

describe("Experience choice", () => {
  it("asks a first-time visitor what they came to see, then plays the rest of the intro for Mi historia", async () => {
    render(<Experience story={STORY} projects={PROJECTS} />)
    await toChoice()
    expect(journeyMounts).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Mi historia" }))
    expect(phase()).toBe("life")
    await advance(3300)
    expect(phase()).toBe("different")
    await advance(3300)
    expect(phase()).toBe("cta")
    expect(track.mock.calls).toEqual([["path_chosen", { path: "story" }]])
  })

  it("asks a returning visitor too, and takes them straight to the gate for Mi historia", async () => {
    window.localStorage.setItem(SEEN, "1")
    render(<Experience story={STORY} projects={PROJECTS} />)
    await advance(0)
    // A returning greeting is brief.
    await advance(2400)
    expect(phase()).toBe("choice")
    expect(journeyMounts).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Mi historia" }))
    expect(phase()).toBe("done")
    expect(journeyMounts).toHaveBeenCalledTimes(1)
    await advance(1000)
    expect(document.querySelector(".ob")).toBeNull()
  })

  it("sends Mi trabajo to /trabajo without mounting the journey or marking the intro as seen", async () => {
    render(<Experience story={STORY} projects={PROJECTS} />)
    await toChoice()
    fireEvent.click(screen.getByRole("button", { name: "Mi trabajo" }))
    await advance(10000)

    expect(push).toHaveBeenCalledWith("/trabajo")
    expect(phase()).toBe("choice")
    expect(journeyMounts).not.toHaveBeenCalled()
    // A recruiter who later chooses the story still gets the whole first visit.
    expect(window.localStorage.getItem(SEEN)).toBeNull()
    expect(track.mock.calls).toEqual([["path_chosen", { path: "work" }]])
  })
})

describe("Experience replay", () => {
  it("clicking Ver intro on the gate starts the full intro again, keeping the journey mounted and never asking again", async () => {
    window.localStorage.setItem(SEEN, "1")
    render(<Experience story={STORY} projects={PROJECTS} />)
    await advance(0)
    expect(phase()).toBe("greeting")
    // A returning visitor: greeting, the choice, then straight to the gate.
    await advance(2400)
    expect(phase()).toBe("choice")
    fireEvent.click(screen.getByRole("button", { name: "Mi historia" }))
    expect(phase()).toBe("done")
    await advance(1000)
    expect(screen.queryByText("Saltar")).toBeNull()
    expect(document.querySelector(".ob")).toBeNull()

    track.mockReset()
    fireEvent.click(screen.getByRole("button", { name: "Ver intro" }))
    expect(phase()).toBe("greeting")
    expect(track.mock.calls).toEqual([["intro_replayed"]])

    // The full sequence follows: no choice (the story was already chosen) and no jump to done after the greeting.
    await advance(4500)
    expect(phase()).toBe("life")
    await advance(5300)
    expect(phase()).toBe("different")
    await advance(4100)
    expect(phase()).toBe("cta")

    // The journey is never remounted, and the control stays out from under the layer while it plays.
    expect(journeyMounts).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("button", { name: "Ver intro" })).toBeNull()
  })

  it("forces the full intro on load with ?intro even when it was seen, the choice included", async () => {
    window.localStorage.setItem(SEEN, "1")
    window.history.replaceState(null, "", "/?intro")
    render(<Experience story={STORY} projects={PROJECTS} />)
    await toChoice()
    fireEvent.click(screen.getByRole("button", { name: "Mi historia" }))
    expect(phase()).toBe("life")
  })
})

describe("Experience projects", () => {
  it("hands the case studies loaded on the server to the journey", async () => {
    window.localStorage.setItem(SEEN, "1")
    render(<Experience story={STORY} projects={PROJECTS} />)
    await advance(0)
    await advance(2400)
    fireEvent.click(screen.getByRole("button", { name: "Mi historia" }))
    expect(journeyMounts).toHaveBeenCalledTimes(1)
    expect(journeyProjects).toHaveBeenLastCalledWith(PROJECTS)
  })
})
