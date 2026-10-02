import { cn } from "@/shared/lib/utils"

/*
 * The add-memory sheet's shared type and surfaces. Every radius and padding is one of the concentric tokens in
 * globals.css, never a literal: the sheet is `rounded-sheet` (32) with `p-sheet` (20); what sits in that padding is
 * `rounded-panel` (32 − 20 = 12); what sits in a panel's `p-panel` (4) is `rounded-inner` (12 − 4 = 8).
 */

/** A field's label: sentence case, in the body face. */
export const LABEL = "t-body block text-[length:var(--type-1)] leading-snug text-ink"

/** One quiet line under a control: a hint, the accepted formats, where a value came from. */
export const HINT = "t-body m-0 text-sm leading-snug text-pretty text-ink-muted"

/** An error, beside the field it is about. */
export const ERROR = "t-body m-0 text-sm leading-snug text-pretty text-signal"

/**
 * The body face on a button. `.ui button { font: inherit }` (globals.css) outranks `.t-body` in the components layer, so
 * a button takes the face as a utility, which always wins over a component.
 */
export const BUTTON_FACE = "t-body font-gambarino"

/** The cool focus ring every control in the sheet shares. */
export const FOCUS = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8c8ff]"

/** Presses down to 0.96. Only the scale and the colors move (never `transition: all`). */
export const PRESS =
  "transition-[scale,background-color,color] duration-150 ease-out active:not-disabled:scale-[0.96] motion-reduce:transition-none"

/** A text field directly inside the sheet padding: a panel, so its corners are concentric with the sheet's. */
export const FIELD = cn(
  "t-body block w-full rounded-panel border border-[#a8c8ff]/20 bg-white/[0.04] px-3.5 py-3 text-[length:var(--type-1)] text-ink outline-none",
  "transition-[border-color,background-color] duration-150 ease-out placeholder:text-ink-muted",
  "hover:border-[#a8c8ff]/35 focus-visible:border-[#a8c8ff]/80 aria-[invalid=true]:border-signal/80 disabled:opacity-60",
)

/** A one-line field: 48 px, the height of the footer's buttons. */
export const INPUT = cn(FIELD, "h-12 py-0")

/** A panel's quiet surface: a faint fill and a 1 px rim drawn inside, so the rim adds nothing to its size. */
export const PANEL = "rounded-panel bg-white/[0.04] shadow-[inset_0_0_0_1px_rgba(168,200,255,0.14)]"
