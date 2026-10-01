export type Rgb = [number, number, number]

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)
const EPS = 1e-6

const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)

/** OKLCH to gamma-encoded sRGB, unclamped (Ottosson's OKLab matrices). h is in degrees. */
function raw(l: number, c: number, h: number): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = Math.pow(l + 0.3963377774 * a + 0.2158037573 * b, 3)
  const m_ = Math.pow(l - 0.1055613458 * a - 0.0638541728 * b, 3)
  const s_ = Math.pow(l - 0.0894841775 * a - 1.291485548 * b, 3)
  return [
    encode(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    encode(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    encode(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ]
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -EPS && v <= 1 + EPS)

/**
 * OKLCH to sRGB, 0..1 per channel. A color the display cannot show keeps its lightness and hue and loses
 * chroma, found by bisection, so a cool hue never drifts toward a neighbor the way a plain clamp would.
 */
export function oklchToSrgb(l: number, c: number, h: number): Rgb {
  let rgb = raw(l, c, h)
  if (!inGamut(rgb)) {
    let lo = 0
    let hi = c
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(raw(l, mid, h))) lo = mid
      else hi = mid
    }
    rgb = raw(l, lo, h)
  }
  return [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])]
}

export function toHex(rgb: readonly number[]): string {
  return "#" + rgb.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("")
}
