"use client"

import { useLayoutEffect, useRef } from "react"
import { FilmGrain } from "./film-grain"
import { STORY_PARAGRAPHS, STORY_TITLE } from "./story"

interface StoryViewProps {
  /** Where the CTA was when it was pressed: the title flies in from there. */
  from: DOMRect | null
  onContinue: () => void
}

const MORPH_MS = 700
const MORPH_EASE = "cubic-bezier(0.16, 1, 0.3, 1)"

export function StoryView({ from, onContinue }: StoryViewProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)

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

  return (
    <section className="ob-story" aria-labelledby="ob-story-title">
      <div className="ob-vignette" aria-hidden="true" />
      <FilmGrain />
      <div className="ob-scroll">
        <div className="ob-col font-gambarino">
          <h2 id="ob-story-title" ref={titleRef} className="ob-title">
            {STORY_TITLE}
          </h2>
          <div className="ob-body">
            {STORY_PARAGRAPHS.map((text, i) => (
              <p key={i} style={{ animationDelay: `${MORPH_MS - 100 + i * 140}ms` }}>
                {text}
              </p>
            ))}
          </div>
          <button
            type="button"
            className="ob-continue press"
            data-magnetic="light"
            data-cursor-label="Continuar"
            onClick={onContinue}
          >
            Continuar
          </button>
        </div>
      </div>
    </section>
  )
}
