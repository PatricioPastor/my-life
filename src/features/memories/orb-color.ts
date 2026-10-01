/**
 * The color of a memory's orb, shared by the browser (which proposes swatches from the photo) and the server (which
 * validates the one the visitor chose). Everything here is pure.
 *
 * Orbs float in a near-black void, so a tone only works as an orb when it glows: a lightness floor and a chroma floor
 * in OKLCH (a perceptual space, so "light enough" means the same for every hue). `glowColor` lifts any tone to those
 * floors, keeping its hue; whatever sRGB cannot show loses chroma instead of changing hue (the gamut mapping of
 * `oklchToSrgb`), which a plain per-channel clamp would not do.
 */

import { oklchToSrgb, toHex } from "@/features/orb/oklch"
import { hexToRgb } from "@/shared/lib/color"

/** Below this lightness an orb sinks into the void. */
export const GLOW_MIN_LIGHTNESS = 0.7
/** Tones that need lifting stop here, so there is still room for color (a pale tone has no chroma left). */
export const GLOW_MAX_LIGHTNESS = 0.86
/** Below this chroma an orb reads as grey. */
export const GLOW_MIN_CHROMA = 0.08

/** How far under the floors a color may be and still pass: 8-bit rounding moves OKLCH by a few thousandths. */
const FLOOR_TOLERANCE = 0.01
/** `glowColor` aims slightly inside the floors, so its own output passes with margin and is stable. */
const FLOOR_MARGIN = 0.003
/** A color with less chroma than this has no meaningful hue (greys, black, white). */
const ACHROMATIC = 0.02
/** The site's cool range (about 250 degrees): given to colors that have no hue of their own. */
const COOL_HUE = 250
/** The rim of an orb is its neighbouring hue. */
const RIM_SHIFT_DEGREES = 30

/** The cool tone used when nothing better is known. It glows. */
export const DEFAULT_ORB_COLOR = "#8ab4ff"

const HEX = /^#[0-9a-f]{6}$/i

/** True for `#rrggbb` (any case). */
export const isHexColor = (value: unknown): value is string => typeof value === "string" && HEX.test(value)

const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))

/** sRGB hex to OKLab (Ottosson). An unreadable hex is black. */
function hexToOklab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(decode)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** sRGB hex to OKLCH: lightness 0..1, chroma, hue in degrees 0..360. */
export function hexToOklch(hex: string): [number, number, number] {
  const [l, a, b] = hexToOklab(hex)
  return [l, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360]
}

/** Perceptual distance between two colors: the Euclidean distance in OKLab (about 0.02 is barely noticeable). */
export function colorDistance(a: string, b: string): number {
  const [l1, a1, b1] = hexToOklab(a)
  const [l2, a2, b2] = hexToOklab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

function meetsFloor(hex: string, slack: number): boolean {
  const [l, c] = hexToOklch(hex)
  return l >= GLOW_MIN_LIGHTNESS - slack && c >= GLOW_MIN_CHROMA - slack
}

/**
 * True when the value is a `#rrggbb` that glows on the void: lightness and chroma at or above the floors (within
 * the tolerance of 8-bit rounding). The server uses this to accept the color the visitor chose.
 */
export function isGlowColor(value: unknown): value is string {
  return isHexColor(value) && meetsFloor(value, FLOOR_TOLERANCE)
}

/**
 * Makes any tone glow: lightness at least 0.70 (never past 0.86 when it had to be lifted), chroma at least 0.08, the
 * same hue, inside sRGB. Colors with no hue (black, greys, white) get the site's cool hue. A tone that already
 * glows comes back unchanged, so the function is idempotent. Answers lowercase `#rrggbb`.
 */
export function glowColor(hex: string): string {
  const source = isHexColor(hex) ? hex.toLowerCase() : "#000000"
  if (meetsFloor(source, FLOOR_MARGIN)) return source

  const [l, c, h] = hexToOklch(source)
  const hue = c < ACHROMATIC ? COOL_HUE : h
  const chroma = Math.max(c, GLOW_MIN_CHROMA)
  let lightness = Math.min(Math.max(l, GLOW_MIN_LIGHTNESS), GLOW_MAX_LIGHTNESS)
  // A pale tone has little chroma room in sRGB, so mapping may leave it grey: step the lightness down until the
  // chroma floor fits. At 0.70 every hue has room, so this always ends.
  for (;;) {
    const out = toHex(oklchToSrgb(lightness, chroma, hue))
    if (lightness <= GLOW_MIN_LIGHTNESS || meetsFloor(out, FLOOR_MARGIN)) return out
    lightness = Math.max(GLOW_MIN_LIGHTNESS, lightness - 0.01)
  }
}

/**
 * The orb color the server stores. The visitor's choice wins when it is a valid glowing `#rrggbb`; otherwise the
 * photo's dominant color (from Cloudinary), made to glow; otherwise the default cool tone. Never throws and never
 * answers a color that would sink into the void.
 */
export function chooseOrbColor(requested: unknown, dominant: unknown): string {
  if (isGlowColor(requested)) return requested.toLowerCase()
  if (isHexColor(dominant)) return glowColor(dominant)
  return DEFAULT_ORB_COLOR
}

/** The neighbouring hue of an orb's color, used for its chromatic rim. It glows too. */
export function rimColor(hex: string, shiftDegrees: number = RIM_SHIFT_DEGREES): string {
  const [l, c, h] = hexToOklch(hex)
  return glowColor(toHex(oklchToSrgb(l, c, (h + shiftDegrees + 360) % 360)))
}

// --- Names -------------------------------------------------------------------------------------------------

/** Hue ranges in OKLCH degrees, `[from, to)`, with the name. Tones here are always light, so lightness splits a few. */
const HUES: ReadonlyArray<readonly [number, number, (lightness: number) => string]> = [
  [12, 40, (l) => (l >= 0.82 ? "rosa" : "rojo")],
  [40, 80, () => "naranja"],
  [80, 108, () => "amarillo"],
  [108, 132, () => "verde lima"],
  [132, 162, () => "verde"],
  [162, 192, () => "verde azulado"],
  [192, 232, () => "celeste"],
  [232, 278, (l) => (l >= 0.8 ? "celeste" : "azul")],
  [278, 318, () => "violeta"],
  [318, 345, () => "fucsia"],
]
/** Names that already say "light": no suffix. */
const ALREADY_LIGHT = new Set(["rosa", "celeste"])
const LIGHT_AT = 0.84

/** A simple Spanish color name from the hue and lightness: "naranja", "violeta", "verde azulado", "celeste". */
export function colorName(hex: string): string {
  const [l, , h] = hexToOklch(hex)
  const found = HUES.find(([from, to]) => h >= from && h < to)
  const name = found ? found[2](l) : "rosa"
  return l >= LIGHT_AT && !ALREADY_LIGHT.has(name) ? `${name} claro` : name
}

/** Names for a row of swatches, made unique ("naranja", "naranja 2") so each one can be told apart by ear. */
export function swatchNames(hexes: readonly string[]): string[] {
  const seen = new Map<string, number>()
  return hexes.map((hex) => {
    const name = colorName(hex)
    const count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    return count === 1 ? name : `${name} ${count}`
  })
}
