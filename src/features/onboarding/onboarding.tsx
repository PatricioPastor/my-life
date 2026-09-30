"use client"

import { useRef, useState, type ActionDispatch } from "react"
import { MagneticCursor } from "@/features/cursor"
import { track } from "@/shared/analytics"
import type { Story } from "@/shared/content"
import { HardwareStep } from "./hardware-step"
import { PhraseLine } from "./phrase-line"
import { DIFFERENT_PHRASE, LIFE_PHRASE, type PhraseKind } from "./phrases"
import { StoryView } from "./story-view"
import type { OnboardingEvent, OnboardingPhase, OnboardingState } from "./onboarding-machine"

interface OnboardingProps {
  story: Story
  state: OnboardingState
  dispatch: ActionDispatch<[OnboardingEvent]>
}

const KINDS: PhraseKind[] = ["greeting", "life", "different"]

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

export function Onboarding({ story, state, dispatch }: OnboardingProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [ctaRect, setCtaRect] = useState<DOMRect | null>(null)
  const { phase } = state
  const CTA_LABEL = story.meta.title
  const active = activeLine(phase)
  // Before the machine starts the greeting stays empty, so SSR never guesses day or night.
  const lines = [phase === "idle" ? "" : state.greeting, LIFE_PHRASE, DIFFERENT_PHRASE]
  const ctaOn = phase === "cta"
  const leaving = phase === "done"

  return (
    <div ref={rootRef} className="ob ui" data-phase={phase} data-leaving={leaving ? "true" : "false"}>
      <div className="ob-stage">
        <div className="ob-lines" aria-live="polite">
          {lines.map((text, i) => (
            <PhraseLine key={i} kind={KINDS[i]!} text={text} active={i === active} returning={state.returning} />
          ))}
        </div>
        <button
          type="button"
          className="ob-cta t-label press"
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
        <StoryView story={story} from={ctaRect} away={phase === "hardware"} onContinue={() => dispatch({ type: "continue" })} />
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
          className="ob-skip t-label press"
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
