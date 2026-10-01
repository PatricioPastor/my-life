/** Anything shorter than this is a collapsing browser toolbar, not a virtual keyboard. */
export const KEYBOARD_MIN_PX = 80

interface VisualViewportBox {
  height: number
  offsetTop: number
}

/**
 * How many CSS px of the bottom of the layout viewport the virtual keyboard covers. Phone browsers keep the layout
 * viewport still and only shrink the visual one, so anything pinned to the bottom (or placed low) ends up behind it.
 */
export function keyboardInset(layoutHeight: number, visual: VisualViewportBox): number {
  const covered = layoutHeight - visual.height - visual.offsetTop
  return covered >= KEYBOARD_MIN_PX ? Math.round(covered) : 0
}
