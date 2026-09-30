"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { track } from "@/shared/analytics"
import type { Story } from "@/shared/content"
import { FilmGrain } from "./film-grain"
import { ReaderStage, ReadingProgress, useCoarsePointer, useReader, useReaderGestures, useReducedMotion } from "./reader"

interface StoryViewProps {
  story: Story
  /** Where the CTA was when it was pressed: the title flies in from there. */
  from: DOMRect | null
  /** The column steps aside (the grain stays) while the next step is on stage. */
  away: boolean
  onContinue: () => void
}

export const MORPH_MS = 700
const MORPH_EASE = "cubic-bezier(0.16, 1, 0.3, 1)"
/** The stage rises while the title lands; the reading starts once it is there. */
export const READ_START_MS = MORPH_MS + 200

export function StoryView({ story, from, away, onContinue }: StoryViewProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const reader = useReader(story.blocks, { startDelayMs: READ_START_MS })
  const { canContinue } = reader
  const coarse = useCoarsePointer()
  // The invitation to go on: once the paragraph is fully painted, except on the last one, where Continuar takes its place.
  const hintOn = reader.done && !canContinue && !away

  // FLIP: the title is laid out in its final place, then animated from the CTA's rect (centre and width).
  useLayoutEffect(() => {
    const el = titleRef.current
    if (!el || !from || from.width === 0) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const to = el.getBoundingClientRect()
    if (to.width === 0) return
    const dx = from.left + from.width / 2 - (to.left + to.width / 2)
    const dy = from.top + from.height / 2 - (to.top + to.height / 2)
    const scale = from.width / to.width
    const anim = el.animate?.(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 },
        { opacity: 1, offset: 0.3 },
        { transform: "none", opacity: 1 },
      ],
      { duration: MORPH_MS, easing: MORPH_EASE, fill: "backwards" },
    )
    return () => anim?.cancel()
  }, [from])

  // The surface takes the keyboard (it is focusable, not a tab stop) and owns wheel, swipe, taps and keys while it is on stage.
  useEffect(() => {
    surfaceRef.current?.focus({ preventScroll: true })
  }, [])
  useReaderGestures(surfaceRef, { onStep: reader.step, onTap: reader.tap }, !away)

  // Finishing the reading is the one thing worth knowing about it: once, with no payload.
  const reported = useRef(false)
  useEffect(() => {
    if (!canContinue || reported.current) return
    reported.current = true
    track("story_completed")
  }, [canContinue])

  return (
    <section className="ob-story" aria-labelledby="ob-story-title">
      <div className="ob-vignette" aria-hidden="true" />
      <FilmGrain />
      <div ref={surfaceRef} className="ob-scroll" data-away={away} inert={away} tabIndex={-1}>
        <div className="ob-col">
          <h2 id="ob-story-title" ref={titleRef} className="ob-title t-title">
            {story.meta.title}
          </h2>
          <ReaderStage blocks={story.blocks} readables={reader.timeline.readables} state={reader.state} reduced={reduced} onMeasure={reader.measure} />
        </div>
      </div>
      <div className="ob-foot" data-away={away} inert={away}>
        <ReadingProgress value={reader.progress} />
        <p className="rd-hint t-label" data-on={hintOn} aria-hidden={!hintOn}>
          <span className="rd-hint-text">{coarse ? "Toca para continuar" : "Haz clic para continuar"}</span>
        </p>
        <button
          type="button"
          className="ob-continue t-label press"
          data-ready={canContinue}
          data-magnetic={canContinue && !away ? "light" : undefined}
          data-cursor-label="Continuar"
          inert={!canContinue}
          onClick={onContinue}
        >
          Continuar
        </button>
      </div>
    </section>
  )
}
