import type { MemoryView, PhotoSize } from "./memory-view"

export type { PhotoSize } from "./memory-view"

/**
 * The square sides a photo is delivered at. A short ladder of roughly doubling widths: every screen and zoom maps to
 * one of a handful of URLs, so the CDN and the browser cache stay effective. 1600 is the glass on a 2x or 3x screen.
 */
export const PHOTO_RUNGS = [96, 192, 384, 768, 1600] as const

/** An image is never shown stretched beyond this: past it, the next size is fetched. */
export const MAX_UPSCALE = 1.25

/**
 * The square sides the server signs for a photo of `width` x `height`: every rung its shorter side fills without
 * upscaling, plus that side itself when it falls between two rungs (or under the first), so the sharpest crop the
 * photo can give is always on offer and nothing is ever enlarged.
 */
export function deliverySides(width: number, height: number): number[] {
  const side = Math.floor(Math.min(width, height))
  if (!(side > 0)) return []
  const sides: number[] = PHOTO_RUNGS.filter((rung) => rung <= side)
  const top = PHOTO_RUNGS[PHOTO_RUNGS.length - 1]
  if (side < top && !sides.includes(side)) sides.push(side)
  return sides
}

const enough = (size: PhotoSize, needed: number) => size.width * MAX_UPSCALE >= needed

/**
 * The size to fetch for a square shown `cssPx` wide on a screen of `dpr`: the smallest one that is never stretched by
 * more than {@link MAX_UPSCALE}, or the largest there is. `sizes` is ascending.
 */
export function pickSize(sizes: readonly PhotoSize[], cssPx: number, dpr: number): PhotoSize | null {
  const needed = cssPx * dpr
  return sizes.find((size) => enough(size, needed)) ?? sizes[sizes.length - 1] ?? null
}

/**
 * What to show right now among the sizes already decoded: the smallest that is sharp enough, otherwise the largest
 * decoded so far (the best there is, and never a blank). Null only before anything has decoded.
 */
export function bestDecoded(
  sizes: readonly PhotoSize[],
  isDecoded: (url: string) => boolean,
  cssPx: number,
  dpr: number,
): PhotoSize | null {
  const ready = sizes.filter((size) => isDecoded(size.url))
  return ready.find((size) => enough(size, cssPx * dpr)) ?? ready[ready.length - 1] ?? null
}

/**
 * What to warm when an approach to a memory may start (a hover, a focus, a finger down, the flight itself), smallest
 * first: a mid size that arrives quickly and is sharp while the orb is still growing, then the size the glass needs.
 */
export function approachSizes(sizes: readonly PhotoSize[], lensCssPx: number, dpr: number): PhotoSize[] {
  const full = pickSize(sizes, lensCssPx, dpr)
  const mid = pickSize(sizes, lensCssPx / 3, dpr)
  if (!full) return []
  return mid && mid.width < full.width ? [mid, full] : [full]
}

/**
 * The square crops of a memory's photo, ascending. The server sends them as `photo.sizes`; a DTO without them (an
 * older fixture) falls back to the thumbnail and the full photo, and a voice with no photo has none.
 */
export function ladderOf(memory: MemoryView): readonly PhotoSize[] {
  if (memory.photo) return memory.photo.sizes
  const sizes: PhotoSize[] = []
  if (memory.thumbUrl) sizes.push({ width: 160, url: memory.thumbUrl })
  if (memory.fullUrl) sizes.push({ width: 1600, url: memory.fullUrl })
  return sizes
}
