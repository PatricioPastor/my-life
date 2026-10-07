import { BAR_TITLE } from "@/shared/lib/top-bar"

/**
 * A place's title ("Recuerdos", "Proyectos"…): on arrival it is the large title of the place; after a short hold it
 * shrinks into a small label under the way back ("‹ Universo"), where it stays as the HUD says where you are.
 */

/** How long the large title holds on arrival (it rises in first). */
export const TITLE_HOLD_MS = 2200
/** The shrink into the label: a FLIP of transform and opacity. */
export const TITLE_SHRINK_MS = 600
export const TITLE_EASE = "cubic-bezier(0.23, 1, 0.32, 1)"
/** Reduced motion: no travel, a crossfade (out quick, back in a little slower). */
export const TITLE_FADE_OUT_MS = 160
export const TITLE_FADE_IN_MS = 240

/**
 * The label: under the top bar, its first letter lined up with the ink of the way back's chevron, placed by the bar's
 * own tokens, at the second type step. Each place sets its own face and color; this is where and how large it sits.
 */
export const TITLE_LABEL = `${BAR_TITLE} text-[length:var(--type-2)] leading-[1.1]`

export interface TitleState {
  mode: "hero" | "label"
  /** Fading out before it changes place (reduced motion). */
  fading: boolean
}

export type TitleEvent = { type: "held"; reduced: boolean } | { type: "faded" } | { type: "settled" }

export const TITLE_START: TitleState = { mode: "hero", fading: false }

export function reduceTitle(state: TitleState, event: TitleEvent): TitleState {
  if (state.mode === "label") return state
  switch (event.type) {
    case "held":
      if (state.fading) return state
      return event.reduced ? { mode: "hero", fading: true } : { mode: "label", fading: false }
    case "faded":
      return state.fading ? { mode: "label", fading: false } : state
    case "settled":
      // Once the visitor has moved on (gone into a memory), the large title has done its job: it comes back as the label.
      return { mode: "label", fading: false }
  }
}

interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * The FLIP: where the label must be put back, and how much bigger, so it starts exactly where the large title was
 * (transform origin at its top left corner). Null when nothing could be measured.
 */
export function flipTransform(first: Box, last: Box): { dx: number; dy: number; scale: number } | null {
  if (!(first.width > 0 && last.width > 0)) return null
  return { dx: first.left - last.left, dy: first.top - last.top, scale: first.width / last.width }
}
