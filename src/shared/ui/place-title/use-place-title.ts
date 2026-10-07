"use client"

import { useEffect, useLayoutEffect, useReducer, useRef, type RefObject } from "react"
import { TITLE_EASE, TITLE_FADE_OUT_MS, TITLE_HOLD_MS, TITLE_SHRINK_MS, TITLE_START, flipTransform, reduceTitle } from "./title-motion"

/** The label's resting opacity: a quiet HUD line next to the way back (the `.place-title` rule in globals.css). */
const LABEL_OPACITY = 0.88

interface PlaceTitleOptions {
  /** The visitor's reduced-motion preference: a crossfade instead of the FLIP. */
  reduced: boolean
  /** The visitor has moved on (gone into a memory): the title becomes the label at once, with no animation. */
  settled?: boolean
}

/**
 * Runs a place's title: large on arrival, a FLIP into the small label after the hold (a crossfade under reduced
 * motion). The FLIP runs on the Web Animations API, off the main thread. `ref` is the heading; the place draws it with
 * `data-title={mode}` and `data-fading={fading}` and the `.place-title` class, and picks its classes by `mode`.
 */
export function usePlaceTitle(ref: RefObject<HTMLElement | null>, { reduced, settled = false }: PlaceTitleOptions) {
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

  // The visitor moved on: the large title has done its job (the place hides it then, so it changes with no animation).
  useEffect(() => {
    if (!settled) return
    first.current = null
    dispatch({ type: "settled" })
  }, [settled])

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

  return { mode: state.mode, fading: state.fading }
}
