"use client"

import type { RefObject } from "react"
import { usePlaceTitle } from "@/shared/ui/place-title"
import type { Approach } from "./approach"
import { titleHidden } from "./title-motion"

/**
 * Runs the "Recuerdos" title on the shared place title: large on arrival, a FLIP into the small label after the hold
 * (a crossfade under reduced motion). Going into a memory settles it as the label for good, and it is hidden while the
 * camera is on a memory.
 */
export function useTitle(phase: Approach["phase"], reduced: boolean, ref: RefObject<HTMLElement | null>) {
  const title = usePlaceTitle(ref, { reduced, settled: phase !== "idle" })
  return { ...title, hidden: titleHidden(phase) }
}
