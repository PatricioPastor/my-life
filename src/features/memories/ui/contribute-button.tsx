import type { ComponentProps } from "react"
import { BAR_CONTROL } from "@/shared/lib/top-bar"
import { cn } from "@/shared/lib/utils"
import { ORB_HUES, ORB_HUE_NAMES } from "../orb-hues"

/** The curated hue the mark glows in: lavanda, a quiet nod to the orbs' palette that sits with the cool sky. */
const GLOW = ORB_HUES.find((hex) => ORB_HUE_NAMES[hex] === "lavanda")!

/**
 * A small light: a thin ring in the hue around a plus in the label's ink, with a soft glow and no offset (it is a
 * light, not a raised surface). Its box is the back chevron's (14 px), so the two marks lead their words alike.
 */
function ContributeMark() {
  return (
    <svg
      data-contribute-mark
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      style={{ filter: `drop-shadow(0 0 4px ${GLOW}80)` }}
    >
      <circle cx="7" cy="7" r="6.5" stroke={GLOW} strokeOpacity="0.75" />
      <path d="M7 4v6M4 7h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  )
}

/**
 * "Contribuir": the plus mark and the word, drawn exactly like the way back ("‹ Universo") so the two read as one bar,
 * mirrored across the screen. Used by the space's top bar (as the trigger of the contribution sheet, so it takes and
 * passes on whatever the trigger gives it) and by the glass of a memory. It places nothing itself.
 */
export function ContributeButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-magnetic="light"
      data-cursor-label="Contribuir"
      className={cn(BAR_CONTROL, className)}
      {...props}
    >
      <ContributeMark />
      {/*
        1 px of optical padding, measured in Chromium: Silkscreen's trailing side bearing leaves the word's last ink about
        1 px nearer the edge than the chevron's square-cap overhang leaves its first ink (21.98 vs 22.94 px). It sits on
        the word, so the box keeps the way back's exact classes.
      */}
      <span className="pr-px">Contribuir</span>
    </button>
  )
}
