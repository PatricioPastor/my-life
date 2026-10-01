import type { Box } from "./point-layout"

// The title is set in Gambarino at --type-display: clamp(40px, 40px + (100vw - 360px) * 0.054, 107px),
// left 24 (80 from md), 72 above the bottom.
const TITLE_BOTTOM_PX = 72
const TITLE_LINE_HEIGHT = 0.9
// "Recuerdos" in a regular serif is a little over four ems wide.
const TITLE_WIDTH_EM = 4.6
const TITLE_PAD_PX = 24
const MD_PX = 768
// The journey's back control (top-7 left-9, 48 px tall) with the room around it.
const BACK: Box = { left: 0, top: 0, right: 200, bottom: 92 }
// The bottom zone shared with the other places, and the corner reserved for the "Agregar recuerdo" control.
const BOTTOM_ZONE_PX = 96
const ADD_SLOT = { width: 260, height: 170 }

/** The title's font size in px at a viewport width: the same line as the `--type-display` token. */
export function titleFontSize(width: number): number {
  return Math.min(Math.max(40 + (width - 360) * 0.054, 40), 107)
}

/** The boxes the floating points keep clear of: the title, the back control, the bottom zone and the add slot. */
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
    { left: width - ADD_SLOT.width, top: height - ADD_SLOT.height, right: width, bottom: height },
  ]
}
