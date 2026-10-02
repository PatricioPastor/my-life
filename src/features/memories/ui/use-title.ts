"use client"

import { useEffect, useLayoutEffect, useReducer, useRef, type RefObject } from "react"
import type { Approach } from "./approach"
import {
  TITLE_EASE,
  TITLE_FADE_OUT_MS,
  TITLE_HOLD_MS,
  TITLE_SHRINK_MS,
  TITLE_START,
  flipTransform,
  reduceTitle,
  titleHidden,
} from "./title-motion"

/** The label's resting opacity: a quiet HUD line next to the way back. */
const LABEL_OPACITY = 0.88

/**
 * Runs the "Recuerdos" title: large on arrival, a FLIP into the small label after the hold (a crossfade under reduced
 * motion), and hidden while the camera is on a memory. The FLIP runs on the Web Animations API, off the main thread.
 */
export function useTitle(phase: Approach["phase"], reduced: boolean, ref: RefObject<HTMLElement | null>) {
  const [state, dispatch] = useReducer(reduceTitle, TITLE_START)
  const first = useRef<DOMRect | null>(null)
  const reducedRef = useRef(reduced)
  useEffect(() => {
    reducedRef.current = reduced
  }, [reduced])

  // The hold: then it measures where the large title is and becomes the label.
  useEffect(() => {
    const held = window.setTimeout(() => {
      first.current = ref.current?.getBoundingClientRect() ?? null
      dispatch({ type: "held", reduced: reducedRef.current })
    }, TITLE_HOLD_MS)
    return () => window.clearTimeout(held)
  }, [ref])

  // Reduced motion: it has faded out; it comes back in as the label.
  useEffect(() => {
    if (!state.fading) return
    const faded = window.setTimeout(() => dispatch({ type: "faded" }), TITLE_FADE_OUT_MS)
    return () => window.clearTimeout(faded)
  }, [state.fading])

  // The visitor went in: the large title has done its job (it is hidden now, so it changes with no animation).
  useEffect(() => {
    if (phase === "idle") return
    first.current = null
    dispatch({ type: "approached" })
  }, [phase])

  // The FLIP: the label starts where the large title was, at its size, and settles into place.
  useLayoutEffect(() => {
    const el = ref.current
    const from = first.current
    first.current = null
    if (state.mode !== "label" || !el || !from || reducedRef.current || typeof el.animate !== "function") return
    const t = flipTransform(from, el.getBoundingClientRect())
    if (!t) return
    el.animate(
      [
        { transformOrigin: "0 0", transform: `translate(${t.dx}px, ${t.dy}px) scale(${t.scale})`, opacity: 1 },
        { transformOrigin: "0 0", transform: "none", opacity: LABEL_OPACITY },
      ],
      { duration: TITLE_SHRINK_MS, easing: TITLE_EASE },
    )
  }, [state.mode, ref])

  return { mode: state.mode, fading: state.fading, hidden: titleHidden(phase) }
}
