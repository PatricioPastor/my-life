import type { Approach } from "./approach"

/**
 * The "Recuerdos" title runs on the shared place title (src/shared/ui/place-title): large on arrival, then the small
 * label under the way back. What is the memories' own is that it hides while the camera is on a memory, so it never
 * meets the glass caption. The timing is re-exported for the space's tests.
 */
export { TITLE_EASE, TITLE_FADE_OUT_MS, TITLE_HOLD_MS, TITLE_SHRINK_MS } from "@/shared/ui/place-title"

/** Hidden while the camera flies to a memory, the glass is open, or it moves to another one. */
export function titleHidden(phase: Approach["phase"]): boolean {
  return phase === "flying" || phase === "open" || phase === "switching"
}
