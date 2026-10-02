/**
 * The curated orb palette: twelve hues, 30 degrees apart around the OKLCH wheel (15, 45, ... 345), so the memories
 * space can be a sea of colors instead of a blue sky. Pure data and pure helpers, shared by the browser (the swatches
 * offered, the default drawn for a voice-only memory) and the server (the color of a memory that has none).
 *
 * Each hex was computed, not picked by eye: `oklchToSrgb` + `toHex` (`features/orb/oklch`) at a lightness and chroma
 * tuned per hue so the color stays inside sRGB (at most ~93% of the gamut's chroma there, so nothing is clipped),
 * passes `isGlowColor`, and sits in one family: lightness 0.74..0.86 (blue and lavender lowest, where sRGB has the
 * least chroma when light; yellow highest, where it reads olive when dark), chroma 0.124..0.14.
 */

const PALETTE = [
  { hex: "#f88d96", name: "rosa" }, // h 15, L 0.76, C 0.13
  { hex: "#f8986c", name: "coral" }, // h 45, L 0.77, C 0.13
  { hex: "#f9ba5f", name: "ámbar" }, // h 75, L 0.83, C 0.13
  { hex: "#dfd65f", name: "limón" }, // h 105, L 0.86, C 0.14
  { hex: "#a5de86", name: "verde" }, // h 135, L 0.84, C 0.13
  { hex: "#6ce5b5", name: "menta" }, // h 165, L 0.84, C 0.13
  { hex: "#47e0e0", name: "turquesa" }, // h 195, L 0.83, C 0.125
  { hex: "#45cbf9", name: "cielo" }, // h 225, L 0.79, C 0.13
  { hex: "#73aef8", name: "azul" }, // h 255, L 0.74, C 0.124
  { hex: "#a39ef9", name: "lavanda" }, // h 285, L 0.74, C 0.13
  { hex: "#daa0f4", name: "violeta" }, // h 315, L 0.79, C 0.13
  { hex: "#f697ce", name: "magenta" }, // h 345, L 0.79, C 0.13
] as const

/** The twelve curated orb colors, lowercase `#rrggbb`, in hue order from rose to magenta. All of them glow. */
export const ORB_HUES: readonly string[] = PALETTE.map(({ hex }) => hex)

/** The short Spanish name of each curated hue, by its hex: what a swatch is called out loud. */
export const ORB_HUE_NAMES: Readonly<Record<string, string>> = Object.fromEntries(PALETTE.map(({ hex, name }) => [hex, name]))

/** One curated hue, drawn with the random source given (`Math.random` unless a test injects its own). */
export function randomOrbHue(random: () => number = Math.random): string {
  const index = Math.floor(random() * ORB_HUES.length)
  return ORB_HUES[Math.min(Math.max(index, 0), ORB_HUES.length - 1)]
}

/** FNV-1a, 32 bit, over the UTF-16 code units: tiny, well spread, and the same on every runtime. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * The curated hue of a memory that has no color of its own (no stored pick, no dominant color): stable for its id,
 * so it never changes between visits, and spread across the palette, so such memories do not all look alike.
 * Changing the hash would repaint every one of them: it is pinned by tests.
 */
export function orbHueFor(id: string): string {
  return ORB_HUES[hash(id) % ORB_HUES.length]
}
