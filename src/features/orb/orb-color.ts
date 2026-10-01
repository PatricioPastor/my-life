import { oklchToSrgb, toHex, type Rgb } from "./oklch"

/** One trip cyan to magenta and back. Slow enough to read as a mood, not a flicker. */
export const ORB_PERIOD_S = 12
/** Cyan, and magenta: the cool end of the wheel. Warm hues never appear, so the orb contrasts the ember sky. */
export const ORB_HUE_MIN = 195
export const ORB_HUE_MAX = 330

// Light enough to glow on the near-black sky, soft enough not to turn neon. Chroma is capped by the gamut.
const LIGHTNESS = 0.78
const CHROMA = 0.12

export interface OrbColor {
  hue: number
  rgb: Rgb
  hex: string
}

/** The orb's color at time `t` seconds: a hue that swings cyan, violet, magenta, violet, cyan. */
export function orbColor(t: number): OrbColor {
  const phase = (2 * Math.PI * t) / ORB_PERIOD_S
  const hue = ORB_HUE_MIN + ((ORB_HUE_MAX - ORB_HUE_MIN) * (1 - Math.cos(phase))) / 2
  const rgb = oklchToSrgb(LIGHTNESS, CHROMA, hue)
  return { hue, rgb, hex: toHex(rgb) }
}
