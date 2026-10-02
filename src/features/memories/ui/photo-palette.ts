import { colorDistance, glowColor } from "../orb-color"
import { ORB_HUES } from "../orb-hues"

/** How many of the photo's own tones the form offers at most (one row of the picker). */
export const SWATCH_COUNT = 6
/** The photo is drawn onto a canvas of at most this many pixels on its longest side before it is read. */
const SAMPLE_SIDE = 64
/** Boxes cut before tones are deduplicated, so there is something to drop when two collapse into one. */
const BOXES = SWATCH_COUNT * 2
/** Two swatches closer than this (distance in OKLab) look like the same color. */
const MIN_DISTANCE = 0.06
/** Pixels at least this opaque count. */
const MIN_ALPHA = 128

type Pixel = readonly [number, number, number]

interface Box {
  pixels: Pixel[]
  /** Channel with the widest spread, and that spread. */
  channel: 0 | 1 | 2
  range: number
}

function makeBox(pixels: Pixel[]): Box {
  let best: 0 | 1 | 2 = 0
  let widest = -1
  for (const channel of [0, 1, 2] as const) {
    let min = 255
    let max = 0
    for (const pixel of pixels) {
      if (pixel[channel] < min) min = pixel[channel]
      if (pixel[channel] > max) max = pixel[channel]
    }
    if (max - min > widest) {
      widest = max - min
      best = channel
    }
  }
  return { pixels, channel: best, range: widest }
}

/** Splits a box at the median of its widest channel. Both halves keep every pixel of equal value together. */
function split(box: Box): [Box, Box] {
  const sorted = [...box.pixels].sort((a, b) => a[box.channel] - b[box.channel])
  let middle = sorted.length >> 1
  // Never cut through a run of equal values: that would leave two boxes with the same average.
  const at = sorted[middle][box.channel]
  while (middle > 0 && sorted[middle - 1][box.channel] === at) middle--
  if (middle === 0) {
    while (middle < sorted.length && sorted[middle][box.channel] === at) middle++
  }
  return [makeBox(sorted.slice(0, middle)), makeBox(sorted.slice(middle))]
}

const mean = (pixels: readonly Pixel[]): Pixel => {
  let r = 0
  let g = 0
  let b = 0
  for (const pixel of pixels) {
    r += pixel[0]
    g += pixel[1]
    b += pixel[2]
  }
  const n = pixels.length
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}

const toHex = ([r, g, b]: Pixel) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`

/**
 * Tones of an RGBA image, by median cut: the pixels are split again and again along their widest color channel until
 * there are a dozen boxes, and each box answers with its average. Each tone is then lifted to glow on the dark void
 * (`glowColor`) and tones that end up looking alike are dropped, so every swatch offered is a distinct, usable orb
 * color. The most prominent tone comes first. Transparent pixels are ignored; an image with none gives no tones.
 */
export function extractPalette(rgba: ArrayLike<number>, max: number = SWATCH_COUNT): string[] {
  const pixels: Pixel[] = []
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] >= MIN_ALPHA) pixels.push([rgba[i], rgba[i + 1], rgba[i + 2]])
  }
  if (pixels.length === 0) return []

  const boxes = [makeBox(pixels)]
  while (boxes.length < BOXES) {
    // The next box to cut is the one with the most color spread, weighted by how much of the photo it holds.
    let next = -1
    let score = 0
    boxes.forEach((box, index) => {
      const weight = box.range * Math.sqrt(box.pixels.length)
      if (box.range > 0 && box.pixels.length > 1 && weight > score) {
        score = weight
        next = index
      }
    })
    if (next < 0) break
    const [a, b] = split(boxes[next])
    boxes.splice(next, 1, a, b)
  }

  const kept: string[] = []
  const byShare = [...boxes].sort((a, b) => b.pixels.length - a.pixels.length)
  for (const box of byShare) {
    const tone = glowColor(toHex(mean(box.pixels)))
    if (kept.every((other) => colorDistance(other, tone) >= MIN_DISTANCE)) kept.push(tone)
    if (kept.length === max) break
  }
  return kept
}

/**
 * The swatches the picker offers: the photo's own tones that no curated hue already offers (by the same near-duplicate
 * rule), at most six, dominant first; then the twelve curated hues, always all of them and always in the same place.
 * With no tones (a voice-only memory, or a photo that cannot be read) it is the curated hues alone.
 */
export function orbSwatches(tones: readonly string[]): string[] {
  const own = tones.filter((tone) => ORB_HUES.every((hue) => colorDistance(hue, tone) >= MIN_DISTANCE))
  return [...own.slice(0, SWATCH_COUNT), ...ORB_HUES]
}

/**
 * The swatch that stands for a tone (the photo's dominant one): the tone itself when it is offered, otherwise the
 * offered swatch that looks most like it (the curated hue it was folded into). Null when nothing is offered.
 */
export function swatchFor(swatches: readonly string[], tone: string): string | null {
  if (swatches.includes(tone)) return tone
  let best: string | null = null
  let closest = Infinity
  for (const swatch of swatches) {
    const distance = colorDistance(swatch, tone)
    if (distance < closest) {
      closest = distance
      best = swatch
    }
  }
  return best
}

/** Gives the RGBA pixels of a small copy of the photo, or null when the browser cannot draw it (HEIC, mostly). */
export type PixelReader = (file: Blob) => Promise<ArrayLike<number> | null>

/** Draws the photo onto a tiny canvas. Everything here is best effort: any failure means "cannot read it". */
export const readPixelsFromCanvas: PixelReader = async (file) => {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return null
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, SAMPLE_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) return null
    context.drawImage(bitmap, 0, 0, width, height)
    return context.getImageData(0, 0, width, height).data
  } finally {
    bitmap.close()
  }
}

export interface PhotoPalette {
  /** The photo's glowing `#rrggbb` tones, the dominant one first (see `orbSwatches` for what the picker offers). */
  colors: string[]
  /** False when the photo could not be read: there are no tones, and the curated hues alone are offered. */
  fromPhoto: boolean
}

/** The tones of a picked photo, extracted in the browser. Never throws: a photo it cannot read gives no tones. */
export async function readPhotoPalette(file: Blob, read: PixelReader = readPixelsFromCanvas): Promise<PhotoPalette> {
  try {
    const pixels = await read(file)
    const colors = pixels ? extractPalette(pixels) : []
    if (colors.length > 0) return { colors, fromPhoto: true }
  } catch {
    // Not drawable: no tones of its own.
  }
  return { colors: [], fromPhoto: false }
}
