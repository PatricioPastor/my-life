"use client"

import { useRef, useState, type ActionDispatch } from "react"
import { MagneticCursor } from "@/features/cursor"
import { STORY_TITLE as CTA_LABEL } from "./story"
import { track } from "@/shared/analytics"
import { HardwareStep } from "./hardware-step"
import { StoryView } from "./story-view"
import type { OnboardingEvent, OnboardingPhase, OnboardingState } from "./onboarding-machine"

interface OnboardingProps {
  state: OnboardingState
  dispatch: ActionDispatch<[OnboardingEvent]>
}

const PHRASES = {
  life: "esta, es mi vida",
  different: "pero narrada de una forma diferente",
} as const


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
  const [ctaRect, setCtaRect] = useState<DOMRect | null>(null)
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
          onClick={(e) => {
            setCtaRect(e.currentTarget.getBoundingClientRect())
            dispatch({ type: "cta" })
          }}
        >
          {CTA_LABEL}
        </button>
      </div>

      {(phase === "story" || phase === "hardware") && (
        <StoryView from={ctaRect} away={phase === "hardware"} onContinue={() => dispatch({ type: "continue" })} />
      )}

      {phase === "hardware" && (
        <HardwareStep
          onEnter={() => {
            track("onboarding_completed")
            dispatch({ type: "enter" })
          }}
        />
      )}

      {phase !== "idle" && !leaving && (
        <button
          type="button"
          className="ob-skip press"
          data-magnetic="light"
          data-cursor-label="Saltar"
          onClick={() => {
            track("onboarding_skipped")
            dispatch({ type: "skip" })
          }}
        >
          Saltar
        </button>
      )}
      <MagneticCursor stageRef={rootRef} />
    </div>
  )
}
