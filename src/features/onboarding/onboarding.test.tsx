import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
const track = vi.fn()
const warmUp = vi.fn()
const probe = vi.fn()
vi.mock("@/shared/analytics", () => ({ track: (...a: unknown[]) => track(...a) }))
vi.mock("@/features/sky/warm-up", () => ({ warmUpSky: (...a: unknown[]) => warmUp(...a) }))
vi.mock("./gpu-probe", () => ({ probeRenderer: () => probe() }))

import { Onboarding } from "./onboarding"
import { initialOnboarding, type OnboardingState } from "./onboarding-machine"

afterEach(() => {
  cleanup()
  track.mockReset()
  warmUp.mockReset()
  probe.mockReset()
})

const at = (phase: OnboardingState["phase"]): OnboardingState => ({ ...initialOnboarding, phase, greeting: "buenanochee" })

describe("Onboarding", () => {
  it("exposes the greeting once as text and marks only the current line active", () => {
    render(<Onboarding state={at("greeting")} dispatch={vi.fn()} />)
    expect(screen.getByText("buenanochee").closest(".ob-line")!.getAttribute("data-on")).toBe("true")
    const hidden = screen.getByText("esta, es mi vida").closest(".ob-line")!
    expect(hidden.getAttribute("aria-hidden")).toBe("true")
  })

  it("splits each phrase into aria-hidden letters, words kept whole", () => {
    render(<Onboarding state={at("life")} dispatch={vi.fn()} />)
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
    const { unmount } = render(<Onboarding state={at("life")} dispatch={vi.fn()} />)
    const grab = () =>
      Array.from(document.querySelectorAll(".ob-line")[1]!.querySelectorAll<HTMLElement>(".ob-letter")).map((l) => l.getAttribute("style"))
    const a = grab()
    unmount()
    render(<Onboarding state={at("life")} dispatch={vi.fn()} />)
    expect(grab()).toEqual(a)
  })

  it("shows the CTA as a real button only in the cta phase and reports its click", () => {
    const dispatch = vi.fn()
    const { rerender } = render(<Onboarding state={at("different")} dispatch={dispatch} />)
    expect(screen.queryByRole("button", { name: "¿por qué creé esto?" })).toBeNull()
    rerender(<Onboarding state={at("cta")} dispatch={dispatch} />)
    fireEvent.click(screen.getByRole("button", { name: "¿por qué creé esto?" }))
    expect(dispatch).toHaveBeenCalledWith({ type: "cta" })
  })

  it("offers Saltar during the sequence", () => {
    const dispatch = vi.fn()
    render(<Onboarding state={at("life")} dispatch={dispatch} />)
    fireEvent.click(screen.getByRole("button", { name: "Saltar" }))
    expect(dispatch).toHaveBeenCalledWith({ type: "skip" })
  })

  it("tracks skipping without any payload", () => {
    render(<Onboarding state={at("life")} dispatch={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Saltar" }))
    expect(track.mock.calls).toEqual([["onboarding_skipped"]])
  })

  it("confirms hardware acceleration and enters the gate", async () => {
    probe.mockReturnValue({ webgl2: true, renderer: "Apple M2", vendor: "Apple" })
    const dispatch = vi.fn()
    render(<Onboarding state={at("hardware")} dispatch={dispatch} />)
    expect(await screen.findByText("Tu navegador ya usa aceleración por hardware.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }))
    expect(dispatch).toHaveBeenCalledWith({ type: "enter" })
    expect(track.mock.calls).toEqual([["onboarding_completed"]])
  })

  it("strongly suggests acceleration on a software renderer and tracks it", async () => {
    probe.mockReturnValue({ webgl2: true, renderer: "SwiftShader", vendor: "Google" })
    render(<Onboarding state={at("hardware")} dispatch={vi.fn()} />)
    expect(await screen.findByText(/activa la aceleración por hardware de tu navegador/)).toBeTruthy()
    expect(track.mock.calls).toEqual([["hw_accel_suggested"]])
  })

  it("stays soft and silent when the renderer is masked, steps behind a disclosure", async () => {
    probe.mockReturnValue({ webgl2: true })
    render(<Onboarding state={at("hardware")} dispatch={vi.fn()} />)
    expect(await screen.findByText(/Si notas tirones/)).toBeTruthy()
    expect(screen.queryByText(/activa la aceleración por hardware de tu navegador/)).toBeNull()
    expect(screen.getByText("Cómo").closest("details")).toBeTruthy()
    expect(track).not.toHaveBeenCalled()
  })

  it("never compiles the sky program on the render path", async () => {
    probe.mockReturnValue({ webgl2: true, renderer: "Apple M2" })
    render(<Onboarding state={at("hardware")} dispatch={vi.fn()} />)
    await screen.findByText("Tu navegador ya usa aceleración por hardware.")
    expect(warmUp).not.toHaveBeenCalled()
  })
})
