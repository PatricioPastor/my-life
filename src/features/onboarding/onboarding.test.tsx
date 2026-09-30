import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Onboarding } from "./onboarding"
import { initialOnboarding, type OnboardingState } from "./onboarding-machine"

afterEach(cleanup)

const at = (phase: OnboardingState["phase"]): OnboardingState => ({ ...initialOnboarding, phase, greeting: "buenanochee" })

describe("Onboarding", () => {
  it("exposes the greeting as text and marks only the current line active", () => {
    render(<Onboarding state={at("greeting")} dispatch={vi.fn()} />)
    expect(screen.getByText("buenanochee").getAttribute("data-on")).toBe("true")
    expect(screen.getByText("esta, es mi vida", { ignore: "[aria-hidden=false]" }).getAttribute("aria-hidden")).toBe("true")
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
})
