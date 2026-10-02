/**
 * Where the controls of a screen's top bar sit and how they look: the way back on the left, the actions on the right.
 * They share one row (the same distance from the top, under the status bar and the notch), and the two sides mirror
 * each other: every distance is a token in globals.css (`--bar-*`), so no number is spelled out twice and the left
 * and right insets cannot drift apart. Each is a full Tailwind class, spelled out so the compiler sees it.
 */
export const BAR_TOP = "top-(--bar-top)"
export const BAR_LEFT = "left-(--bar-left)"
export const BAR_RIGHT = "right-(--bar-right)"

/**
 * A control of the bar: one row tall (a 48 px target), the bar's padding on its sides, the UI face (Silkscreen,
 * inherited) at 12 px with the bar's tracking, muted ink and the shared press. An icon leads, 12 px from the word.
 */
export const BAR_CONTROL =
  "press flex h-(--bar-row) items-center gap-3 px-(--bar-pad) text-xs tracking-[0.08em] text-ink-muted"

/**
 * A title under the bar, on the left: right under the row (the row's top, plus its height, plus the bar's gap), its
 * first letter lined up with the ink of the back chevron rather than with the button's box.
 */
export const BAR_TITLE =
  "top-[calc(var(--bar-top)+var(--bar-row)+var(--bar-gap))] left-[calc(var(--bar-left)+var(--bar-pad)+var(--bar-ink)-var(--title-bearing))]"
