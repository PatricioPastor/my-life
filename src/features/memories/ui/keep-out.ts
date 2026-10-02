import type { Box } from "./point-layout"

// The title is set in Gambarino at --type-display: clamp(40px, 40px + (100vw - 360px) * 0.054, 107px),
// left 24 (80 from md), 72 above the bottom.
const TITLE_BOTTOM_PX = 72
const TITLE_LINE_HEIGHT = 0.9
// "Recuerdos" in a regular serif is a little over four ems wide.
const TITLE_WIDTH_EM = 4.6
const TITLE_PAD_PX = 24
const MD_PX = 768
// The top bar: the journey's back control on the left and "+ Contribuir" on the right (48 px tall, in line), with the room
// around them. The label under the back control ("Recuerdos") sits inside the left box.
const TOP_BAR_PX = 92
const BACK: Box = { left: 0, top: 0, right: 180, bottom: TOP_BAR_PX }
const CONTRIBUTE_WIDTH_PX = 190
// The bottom zone shared with the other places.
const BOTTOM_ZONE_PX = 96

/** The title's font size in px at a viewport width: the same line as the `--type-display` token. */
export function titleFontSize(width: number): number {
  return Math.min(Math.max(40 + (width - 360) * 0.054, 40), 107)
}

/** The boxes the floating points keep clear of: the title, the top bar (back and Contribuir) and the bottom zone. */
export function memoriesKeepOut(width: number, height: number): Box[] {
  const fontSize = titleFontSize(width)
  const left = width >= MD_PX ? 80 : 24
  const bottom = height - TITLE_BOTTOM_PX
  return [
    {
      left: left - TITLE_PAD_PX,
      top: bottom - fontSize * TITLE_LINE_HEIGHT - TITLE_PAD_PX,
      right: left + fontSize * TITLE_WIDTH_EM + TITLE_PAD_PX,
      bottom,
    },
    BACK,
    { left: 0, top: height - BOTTOM_ZONE_PX, right: width, bottom: height },
    { left: width - CONTRIBUTE_WIDTH_PX, top: 0, right: width, bottom: TOP_BAR_PX },
  ]
}
