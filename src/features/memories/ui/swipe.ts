/** How far a finger must travel sideways to count as a swipe. */
export const SWIPE_MIN_PX = 56

/**
 * +1 for the next memory (a swipe to the left), -1 for the previous one (to the right), 0 for anything else.
 * A drag that is more vertical than horizontal never turns a page.
 */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dy) > Math.abs(dx)) return 0
  return dx < 0 ? 1 : -1
}
