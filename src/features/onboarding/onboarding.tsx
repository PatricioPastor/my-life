"use client"

import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState, type ActionDispatch } from "react"
import { MagneticCursor } from "@/features/cursor"
import { WORK_PATH } from "@/features/work/paths"
import { track, type VisitPath } from "@/shared/analytics"
import type { Story } from "@/shared/content"
import { HardwareStep } from "./hardware-step"
import { PhraseLine } from "./phrase-line"
import { CHOICE_PHRASE, DIFFERENT_PHRASE, LIFE_PHRASE, phraseTimeline, type PhraseKind } from "./phrases"
import { StoryView } from "./story-view"
import { skipOffered, type OnboardingEvent, type OnboardingPhase, type OnboardingState } from "./onboarding-machine"

interface OnboardingProps {
  story: Story
  state: OnboardingState
  dispatch: ActionDispatch<[OnboardingEvent]>
}

const KINDS: PhraseKind[] = ["greeting", "life", "different", "choice"]

/** The answers to the question after the greeting, in the order they are offered. */
const CHOICES: readonly { path: VisitPath; label: string }[] = [
  { path: "work", label: "Mi trabajo" },
  { path: "story", label: "Mi historia" },
]

// The options rise like the CTA (640 ms, in the stylesheet) and land as the question settles, not before it has formed.
const OPTIONS_DELAY_MS = Math.max(0, phraseTimeline("choice", CHOICE_PHRASE, false).enterMs - 640)

/** Which of the lines is on stage for a phase (-1 while none is). */
function activeLine(phase: OnboardingPhase): number {
  switch (phase) {
    case "greeting":
      return 0
    case "life":
      return 1
    case "different":
    case "cta":
      return 2
    case "choice":
      return 3
    default:
      return -1
  }
}

export function Onboarding({ story, state, dispatch }: OnboardingProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const choiceRef = useRef<HTMLDivElement>(null)
  const questionId = useId()
  const router = useRouter()
  const [ctaRect, setCtaRect] = useState<DOMRect | null>(null)
  const { phase } = state
  const CTA_LABEL = story.meta.title
  const active = activeLine(phase)
  // Before the machine starts the greeting stays empty, so SSR never guesses day or night.
  const lines = [phase === "idle" ? "" : state.greeting, LIFE_PHRASE, DIFFERENT_PHRASE, CHOICE_PHRASE]
  const ctaOn = phase === "cta"
  const choiceOn = phase === "choice"
  const leaving = phase === "done"

  // The choice takes the keyboard: focus lands on its group, named by the question, one Tab away from the options. The
  // work's page is fetched meanwhile, so Mi trabajo opens at once.
  useEffect(() => {
    if (!choiceOn) return
    choiceRef.current?.focus({ preventScroll: true })
    router.prefetch(WORK_PATH)
  }, [choiceOn, router])

  return (
    <div ref={rootRef} className="ob ui" data-blocks-shortcuts data-phase={phase} data-leaving={leaving ? "true" : "false"}>
      <div className="ob-stage">
        <div className="ob-lines" aria-live="polite">
          {lines.map((text, i) => (
            <PhraseLine
              key={i}
              kind={KINDS[i]!}
              text={text}
              active={i === active}
              returning={state.returning}
              id={KINDS[i] === "choice" ? questionId : undefined}
            />
          ))}
        </div>
        {/* One slot for the CTA and the choice, never on together, so the lines above never move. */}
        <div className="relative flex w-full justify-center">
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
          {/* Laid over the slot, so on a narrow screen the second option wraps below it instead of pushing the lines up. */}
          <div
            ref={choiceRef}
            role="group"
            aria-labelledby={questionId}
            tabIndex={-1}
            inert={!choiceOn}
            className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap justify-center gap-[var(--space-2)] outline-none"
          >
            {CHOICES.map(({ path, label }) => (
              <button
                key={path}
                type="button"
                className="ob-cta t-label press"
                data-on={choiceOn}
                data-magnetic={choiceOn ? "light" : undefined}
                data-cursor-label={label}
                style={choiceOn ? { transitionDelay: `${OPTIONS_DELAY_MS}ms` } : undefined}
                onClick={() => {
                  track("path_chosen", { path })
                  // The work is another page. Leaving for it never marks the intro as seen, so the story opens in full later.
                  if (path === "work") router.push(WORK_PATH)
                  else dispatch({ type: "chooseStory", now: performance.now() })
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
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

      {skipOffered(state) && (
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
