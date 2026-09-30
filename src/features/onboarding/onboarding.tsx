"use client"

import { useRef, type ActionDispatch } from "react"
import { MagneticCursor } from "@/features/cursor"
import type { OnboardingEvent, OnboardingPhase, OnboardingState } from "./onboarding-machine"

interface OnboardingProps {
  state: OnboardingState
  dispatch: ActionDispatch<[OnboardingEvent]>
}

const PHRASES = {
  life: "esta, es mi vida",
  different: "pero narrada de una forma diferente",
} as const

export const CTA_LABEL = "¿por qué creé esto?"

/** Which of the three lines is on stage for a phase (-1 while none is). */
function activeLine(phase: OnboardingPhase): number {
  switch (phase) {
    case "greeting":
      return 0
    case "life":
      return 1
    case "different":
    case "cta":
      return 2
    default:
      return -1
  }
}

export function Onboarding({ state, dispatch }: OnboardingProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const { phase } = state
  const active = activeLine(phase)
  const lines = [state.greeting, PHRASES.life, PHRASES.different]
  const ctaOn = phase === "cta"
  const leaving = phase === "done"

  return (
    <div ref={rootRef} className="ob ui" data-phase={phase} data-leaving={leaving ? "true" : "false"}>
      <div className="ob-stage">
        <div className="ob-lines" aria-live="polite">
          {lines.map((text, i) => (
            <p key={i} className="ob-line font-gambarino" data-on={i === active} aria-hidden={i !== active}>
              {phase === "idle" ? "" : text}
            </p>
          ))}
        </div>
        <button
          type="button"
          className="ob-cta press"
          data-on={ctaOn}
          data-magnetic={ctaOn ? "light" : undefined}
          data-cursor-label={CTA_LABEL}
          tabIndex={ctaOn ? 0 : -1}
          aria-hidden={!ctaOn}
          onClick={() => dispatch({ type: "cta" })}
        >
          {CTA_LABEL}
        </button>
      </div>

      {phase === "story" && (
        <button type="button" className="ob-cta press" onClick={() => dispatch({ type: "enter" })}>
          Continuar
        </button>
      )}

      {phase !== "idle" && !leaving && (
        <button
          type="button"
          className="ob-skip press"
          data-magnetic="light"
          data-cursor-label="Saltar"
          onClick={() => dispatch({ type: "skip" })}
        >
          Saltar
        </button>
      )}
      <MagneticCursor stageRef={rootRef} />
    </div>
  )
}
