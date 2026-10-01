export interface LoopState {
  /** The loop has not been disposed. */
  alive: boolean
  reduced: boolean
  /** The page is in the background. */
  hidden: boolean
  /** Something opaque sits over the canvas (the glass view), so drawing it again is wasted battery. */
  paused: boolean
}

/** Whether a canvas loop should ask for another animation frame. */
export function loopShouldRun({ alive, reduced, hidden, paused }: LoopState): boolean {
  return alive && !reduced && !hidden && !paused
}
