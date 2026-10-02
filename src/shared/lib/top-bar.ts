/**
 * Where the controls of a screen's top bar sit: the way back on the left, the actions on the right. They all use the
 * same distance from the top (under the status bar and the notch) so they share one line, closer to the edge on a phone
 * than on a desktop. Each is a single Tailwind class pair, spelled out in full so the compiler sees it.
 */
export const BAR_TOP =
  "top-[max(1rem,calc(env(safe-area-inset-top)+0.25rem))] md:top-[max(1.75rem,calc(env(safe-area-inset-top)+0.5rem))]"
export const BAR_LEFT =
  "left-[max(0.5rem,calc(env(safe-area-inset-left)+0.25rem))] md:left-[max(2.25rem,calc(env(safe-area-inset-left)+0.5rem))]"
export const BAR_RIGHT =
  "right-[max(0.75rem,calc(env(safe-area-inset-right)+0.25rem))] md:right-[max(2.25rem,calc(env(safe-area-inset-right)+0.5rem))]"
