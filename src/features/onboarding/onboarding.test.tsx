import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
const track = vi.fn()
const warmUp = vi.fn()
const probe = vi.fn()
const push = vi.fn()
const prefetch = vi.fn()
vi.mock("@/shared/analytics", () => ({ track: (...a: unknown[]) => track(...a) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch }) }))
vi.mock("@/features/sky/warm-up", () => ({ warmUpSky: (...a: unknown[]) => warmUp(...a) }))
vi.mock("./gpu-probe", () => ({ probeRenderer: () => probe() }))
// The idle hand-off is a real 200 ms timer in jsdom; under CPU load it outlived findBy's 1 s default. Run it inline instead.
vi.mock("./idle", () => ({
  whenIdle: (task: () => void) => {
    task()
    return () => {}
  },
}))

import { Onboarding } from "./onboarding"
import { initialOnboarding, type OnboardingState } from "./onboarding-machine"
import { STORY } from "./story-fixture"

afterEach(() => {
  cleanup()
  track.mockReset()
  warmUp.mockReset()
  probe.mockReset()
  push.mockReset()
  prefetch.mockReset()
})

const at = (phase: OnboardingState["phase"], replayed = false): OnboardingState => ({
  ...initialOnboarding,
  phase,
  greeting: "buenanochee",
  replayed,
})

const QUESTION = "¿qué vienes a ver?"
const choiceGroup = () => screen.getByRole("group", { name: QUESTION })

describe("Onboarding", () => {
  it("exposes the greeting once as text and marks only the current line active", () => {
    render(<Onboarding story={STORY} state={at("greeting")} dispatch={vi.fn()} />)
    expect(screen.getByText("buenanochee").closest(".ob-line")!.getAttribute("data-on")).toBe("true")
    const hidden = screen.getByText("esta, es mi vida").closest(".ob-line")!
    expect(hidden.getAttribute("aria-hidden")).toBe("true")
  })

  it("splits each phrase into aria-hidden letters, words kept whole", () => {
    render(<Onboarding story={STORY} state={at("life")} dispatch={vi.fn()} />)
    const line = screen.getByText("esta, es mi vida").closest(".ob-line")!
    const letters = line.querySelectorAll(".ob-letter")
    expect(letters.length).toBe("esta,esmivida".length)
    expect(line.querySelectorAll(".ob-word").length).toBe(4)
    for (const l of letters) expect(l.closest("[aria-hidden=true]")).toBeTruthy()
    const first = letters[0] as HTMLElement
    expect(first.style.getPropertyValue("--dx")).toMatch(/px$/)
    expect(first.style.getPropertyValue("--delay")).toMatch(/ms$/)
    expect(first.style.getPropertyValue("--dur")).toMatch(/ms$/)
  })

  it("renders the same origins on every render of a phrase", () => {
    const { unmount } = render(<Onboarding story={STORY} state={at("life")} dispatch={vi.fn()} />)
    const grab = () =>
      Array.from(document.querySelectorAll(".ob-line")[1]!.querySelectorAll<HTMLElement>(".ob-letter")).map((l) => l.getAttribute("style"))
    const a = grab()
    unmount()
    render(<Onboarding story={STORY} state={at("life")} dispatch={vi.fn()} />)
    expect(grab()).toEqual(a)
  })

  it("shows the CTA as a real button only in the cta phase and reports its click", () => {
    const dispatch = vi.fn()
    const { rerender } = render(<Onboarding story={STORY} state={at("different")} dispatch={dispatch} />)
    expect(screen.queryByRole("button", { name: "¿por qué creé esto?" })).toBeNull()
    rerender(<Onboarding story={STORY} state={at("cta")} dispatch={dispatch} />)
    fireEvent.click(screen.getByRole("button", { name: "¿por qué creé esto?" }))
    expect(dispatch).toHaveBeenCalledWith({ type: "cta" })
  })

  it("asks what the visitor came to see on the line the greeting left, with exactly two real buttons", () => {
    render(<Onboarding story={STORY} state={at("choice")} dispatch={vi.fn()} />)
    expect(screen.getByText(QUESTION).closest(".ob-line")!.getAttribute("data-on")).toBe("true")
    expect(screen.getByText("buenanochee").closest(".ob-line")!.getAttribute("data-on")).toBe("false")
    const options = Array.from(choiceGroup().querySelectorAll("button"))
    expect(options.map((b) => b.textContent)).toEqual(["Mi trabajo", "Mi historia"])
    for (const option of options) {
      expect(option.getAttribute("type")).toBe("button")
      expect(option.getAttribute("data-on")).toBe("true")
    }
    expect(choiceGroup().hasAttribute("inert")).toBe(false)
  })

  it("keeps the two options out of reach in every other phase", () => {
    const { rerender } = render(<Onboarding story={STORY} state={at("greeting")} dispatch={vi.fn()} />)
    for (const phase of ["greeting", "life", "cta", "done"] as const) {
      rerender(<Onboarding story={STORY} state={at(phase)} dispatch={vi.fn()} />)
      const group = screen.getByRole("button", { name: "Mi trabajo" }).closest("[role='group']")!
      expect(group.hasAttribute("inert"), phase).toBe(true)
      expect(screen.getByRole("button", { name: "Mi historia" }).getAttribute("data-on"), phase).toBe("false")
    }
  })

  it("moves focus to the question when the choice comes up, so the keyboard lands on the options", () => {
    const { rerender } = render(<Onboarding story={STORY} state={at("greeting")} dispatch={vi.fn()} />)
    expect(document.activeElement).toBe(document.body)
    rerender(<Onboarding story={STORY} state={at("choice")} dispatch={vi.fn()} />)
    expect(document.activeElement).toBe(choiceGroup())
  })

  it("goes to the work at /trabajo with the router on Mi trabajo, and reports the path", () => {
    const dispatch = vi.fn()
    render(<Onboarding story={STORY} state={at("choice")} dispatch={dispatch} />)
    fireEvent.click(screen.getByRole("button", { name: "Mi trabajo" }))
    expect(push).toHaveBeenCalledWith("/trabajo")
    expect(dispatch).not.toHaveBeenCalled()
    expect(track.mock.calls).toEqual([["path_chosen", { path: "work" }]])
  })

  it("goes on with the story on Mi historia, and reports the path", () => {
    const dispatch = vi.fn()
    render(<Onboarding story={STORY} state={at("choice")} dispatch={dispatch} />)
    fireEvent.click(screen.getByRole("button", { name: "Mi historia" }))
    expect(dispatch).toHaveBeenCalledWith({ type: "chooseStory", now: expect.any(Number) })
    expect(push).not.toHaveBeenCalled()
    expect(track.mock.calls).toEqual([["path_chosen", { path: "story" }]])
  })

  it("fetches /trabajo ahead once the choice is up, and not before", () => {
    const { rerender } = render(<Onboarding story={STORY} state={at("greeting")} dispatch={vi.fn()} />)
    expect(prefetch).not.toHaveBeenCalled()
    rerender(<Onboarding story={STORY} state={at("choice")} dispatch={vi.fn()} />)
    expect(prefetch).toHaveBeenCalledWith("/trabajo")
  })

  it("never offers Saltar before the choice or on it: the choice cannot be skipped", () => {
    for (const phase of ["greeting", "choice"] as const) {
      render(<Onboarding story={STORY} state={at(phase)} dispatch={vi.fn()} />)
      expect(screen.queryByRole("button", { name: "Saltar" }), phase).toBeNull()
      cleanup()
    }
  })

  it("offers Saltar from the first phrase of a replay: the visitor already chose the story", () => {
    const dispatch = vi.fn()
    render(<Onboarding story={STORY} state={at("greeting", true)} dispatch={dispatch} />)
    fireEvent.click(screen.getByRole("button", { name: "Saltar" }))
    expect(dispatch).toHaveBeenCalledWith({ type: "skip" })
  })

  it("offers Saltar during the sequence", () => {
    const dispatch = vi.fn()
    render(<Onboarding story={STORY} state={at("life")} dispatch={dispatch} />)
    fireEvent.click(screen.getByRole("button", { name: "Saltar" }))
    expect(dispatch).toHaveBeenCalledWith({ type: "skip" })
  })

  it("tracks skipping without any payload", () => {
    render(<Onboarding story={STORY} state={at("life")} dispatch={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Saltar" }))
    expect(track.mock.calls).toEqual([["onboarding_skipped"]])
  })

  it("confirms hardware acceleration and enters the gate", async () => {
    probe.mockReturnValue({ webgl2: true, renderer: "Apple M2", vendor: "Apple" })
    const dispatch = vi.fn()
    render(<Onboarding story={STORY} state={at("hardware")} dispatch={dispatch} />)
    expect(await screen.findByText("Tu navegador ya usa aceleración por hardware.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }))
    expect(dispatch).toHaveBeenCalledWith({ type: "enter" })
    expect(track.mock.calls).toEqual([["onboarding_completed"]])
  })

  it("strongly suggests acceleration on a software renderer and tracks it", async () => {
    probe.mockReturnValue({ webgl2: true, renderer: "SwiftShader", vendor: "Google" })
    render(<Onboarding story={STORY} state={at("hardware")} dispatch={vi.fn()} />)
    expect(await screen.findByText(/activa la aceleración por hardware de tu navegador/)).toBeTruthy()
    expect(track.mock.calls).toEqual([["hw_accel_suggested"]])
  })

  it("stays soft and silent when the renderer is masked, steps behind a disclosure", async () => {
    probe.mockReturnValue({ webgl2: true })
    render(<Onboarding story={STORY} state={at("hardware")} dispatch={vi.fn()} />)
    expect(await screen.findByText(/Si notas tirones/)).toBeTruthy()
    expect(screen.queryByText(/activa la aceleración por hardware de tu navegador/)).toBeNull()
    expect(screen.getByText("Cómo").closest("details")).toBeTruthy()
    expect(track).not.toHaveBeenCalled()
  })

  it("never compiles the sky program on the render path", async () => {
    probe.mockReturnValue({ webgl2: true, renderer: "Apple M2" })
    render(<Onboarding story={STORY} state={at("hardware")} dispatch={vi.fn()} />)
    await screen.findByText("Tu navegador ya usa aceleración por hardware.")
    expect(warmUp).not.toHaveBeenCalled()
  })
})
