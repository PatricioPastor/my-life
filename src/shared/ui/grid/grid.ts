/**
 * The place grid: six equal columns from md, as a reference to place things on rather than cells to fill. Its first
 * column starts on the ink of the way back's chevron, the axis a place's label hangs from (BAR_TITLE), so the label,
 * the content and the guides share one left edge; the right inset mirrors it. On a phone it is a single column on
 * that same axis. Every distance is a token in globals.css (`--grid-*`); each is a full Tailwind class, spelled out so
 * the compiler sees it.
 */

/** One column on a phone, six equal ones from md, with the shared gutter. */
export const GRID = "md:grid md:grid-cols-6 md:gap-x-(--grid-gap)"

/** The grid's horizontal insets, for a grid placed absolutely on the screen. */
export const GRID_X = "left-(--grid-left) right-(--grid-right)"

/** The left zone, columns 1–2: what says where you are (a list's meta, a case study's side). */
export const GRID_ASIDE = "md:col-start-1 md:col-span-2"

/** The content zone, columns 3–6. */
export const GRID_CONTENT = "md:col-start-3 md:col-span-4"
