import { describe, expect, it, vi } from "vitest"
import { colorDistance, hexToOklch, isGlowColor } from "../orb-color"
import { ORB_HUES } from "../orb-hues"
import { SWATCH_COUNT, extractPalette, orbSwatches, readPhotoPalette, swatchFor, type PixelReader } from "./photo-palette"

type Rgb = readonly [number, number, number]

const ORANGE: Rgb = [255, 154, 60]
const BLUE: Rgb = [30, 60, 220]
const GREEN: Rgb = [40, 180, 90]
const PINK: Rgb = [235, 90, 170]
const YELLOW: Rgb = [240, 220, 60]
const TEAL: Rgb = [30, 170, 170]

/** RGBA pixels: each entry is `[color, count]` (alpha 255 unless given). */
function image(parts: ReadonlyArray<readonly [Rgb, number] | readonly [Rgb, number, number]>): Uint8ClampedArray {
  const total = parts.reduce((sum, part) => sum + part[1], 0)
  const data = new Uint8ClampedArray(total * 4)
  let at = 0
  for (const [[r, g, b], count, alpha = 255] of parts) {
    for (let i = 0; i < count; i++) data.set([r, g, b, alpha], (at++) * 4)
  }
  return data
}

const hue = (hex: string) => hexToOklch(hex)[2]
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b) % 360, 360 - (Math.abs(a - b) % 360))
const hexOf = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`

describe("extractPalette", () => {
  it("puts the dominant tone first, then the rest by how much of the photo they cover", () => {
    const colors = extractPalette(image([[ORANGE, 700], [BLUE, 200], [GREEN, 100]]))
    expect(colors).toHaveLength(3)
    expect(hueGap(hue(colors[0]), hue(hexOf(ORANGE)))).toBeLessThan(10)
    expect(hueGap(hue(colors[1]), hue(hexOf(BLUE)))).toBeLessThan(10)
    expect(hueGap(hue(colors[2]), hue(hexOf(GREEN)))).toBeLessThan(10)
  })

  it("offers up to six tones, and never more, even for a photo of many colors", () => {
    const six = extractPalette(image([[ORANGE, 100], [BLUE, 100], [GREEN, 100], [PINK, 100], [YELLOW, 100], [TEAL, 100]]))
    expect(six).toHaveLength(SWATCH_COUNT)
    const many = extractPalette(image(Array.from({ length: 24 }, (_, i) => [[(i * 53) % 256, (i * 97) % 256, (i * 151) % 256], 50] as const)))
    expect(many.length).toBeLessThanOrEqual(SWATCH_COUNT)
    expect(many.length).toBeGreaterThanOrEqual(3)
  })

  it("keeps every tone distinct: near-identical tones collapse into one", () => {
    const colors = extractPalette(
      image([[ORANGE, 300], [[255, 155, 61], 300], [[254, 153, 59], 200], [BLUE, 200]]),
    )
    expect(colors).toHaveLength(2)
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) expect(colorDistance(colors[i], colors[j])).toBeGreaterThan(0.05)
    }
  })

  it("keeps tones distinct after they are lifted to glow: shades of one dark hue become one swatch", () => {
    const colors = extractPalette(image([[[10, 15, 42], 300], [[12, 17, 48], 300], [[8, 12, 36], 300], [[16, 22, 60], 100]]))
    expect(colors).toHaveLength(1)
  })

  it("makes every tone glow on the dark void", () => {
    const colors = extractPalette(image([[[10, 15, 42], 400], [[60, 40, 20], 300], [[250, 250, 250], 200], [[0, 0, 0], 100]]))
    expect(colors.length).toBeGreaterThanOrEqual(1)
    for (const color of colors) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/)
      expect(isGlowColor(color)).toBe(true)
    }
  })

  it("still gives a cool, glowing swatch for a grey or black-and-white photo", () => {
    const colors = extractPalette(image([[[128, 128, 128], 500], [[0, 0, 0], 300], [[255, 255, 255], 200]]))
    expect(colors.length).toBeGreaterThanOrEqual(1)
    for (const color of colors) {
      expect(isGlowColor(color)).toBe(true)
      expect(hue(color)).toBeGreaterThan(200)
      expect(hue(color)).toBeLessThan(300)
    }
  })

  it("ignores transparent pixels", () => {
    const colors = extractPalette(image([[ORANGE, 300], [BLUE, 2000, 0]]))
    expect(colors).toHaveLength(1)
    expect(hueGap(hue(colors[0]), hue(hexOf(ORANGE)))).toBeLessThan(10)
  })

  it("has no tones for an empty or fully transparent image", () => {
    expect(extractPalette(new Uint8ClampedArray(0))).toEqual([])
    expect(extractPalette(image([[ORANGE, 50, 0]]))).toEqual([])
  })

  it("handles a single pixel and a flat image", () => {
    expect(extractPalette(image([[ORANGE, 1]]))).toHaveLength(1)
    expect(extractPalette(image([[ORANGE, 4096]]))).toHaveLength(1)
  })

  it("is deterministic", () => {
    const data = image([[ORANGE, 300], [BLUE, 250], [GREEN, 200], [PINK, 150]])
    expect(extractPalette(data)).toEqual(extractPalette(data))
  })

  it("answers within a frame for the largest image the reader makes (64 x 64)", () => {
    const data = new Uint8ClampedArray(64 * 64 * 4)
    let seed = 7
    for (let i = 0; i < data.length; i++) data[i] = i % 4 === 3 ? 255 : ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16) & 255
    const started = performance.now()
    const colors = extractPalette(data)
    expect(performance.now() - started).toBeLessThan(250)
    expect(colors.length).toBeGreaterThanOrEqual(1)
    expect(colors.length).toBeLessThanOrEqual(SWATCH_COUNT)
  })
})

describe("orbSwatches (what the picker offers)", () => {
  /** Glowing photo tones that no curated hue looks like (each at least 0.07 away in OKLab from all twelve). */
  const OWN = ["#ce8b9f", "#cf9175", "#b69f62", "#8bae78", "#60b3a3", "#63adca", "#b692c6"]

  it("offers the twelve curated hues alone when there are no photo tones (a voice, or a photo it cannot read)", () => {
    expect(orbSwatches([])).toEqual(ORB_HUES)
  })

  it("puts the photo's own tones first, the dominant one first, then the twelve curated hues", () => {
    expect(orbSwatches(OWN.slice(0, 3))).toEqual([...OWN.slice(0, 3), ...ORB_HUES])
  })

  it("drops a photo tone a curated hue already offers, by the same near-duplicate rule as the photo's own tones", () => {
    const coralish = "#f99a6e"
    expect(colorDistance(coralish, ORB_HUES[1])).toBeLessThan(0.06)
    expect(orbSwatches([OWN[0], coralish, OWN[1]])).toEqual([OWN[0], OWN[1], ...ORB_HUES])
  })

  it("keeps at most six photo tones", () => {
    const out = orbSwatches(OWN)
    expect(out.slice(0, SWATCH_COUNT)).toEqual(OWN.slice(0, SWATCH_COUNT))
    expect(out).toHaveLength(SWATCH_COUNT + ORB_HUES.length)
  })

  it("never offers two swatches that look alike, and every one glows", () => {
    const out = orbSwatches([...OWN, "#f99a6e", "#8fe08a"])
    for (const [i, a] of out.entries()) {
      expect(isGlowColor(a)).toBe(true)
      for (const b of out.slice(i + 1)) expect(colorDistance(a, b), `${a} ${b}`).toBeGreaterThanOrEqual(0.06)
    }
  })
})

describe("swatchFor (the swatch that stands for the photo's dominant tone)", () => {
  it("is the tone itself when it is offered", () => {
    const swatches = orbSwatches(["#ce8b9f"])
    expect(swatchFor(swatches, "#ce8b9f")).toBe("#ce8b9f")
  })

  it("is the curated hue it was folded into when a curated hue already offered it", () => {
    const swatches = orbSwatches(["#f99a6e"])
    expect(swatches).not.toContain("#f99a6e")
    expect(swatchFor(swatches, "#f99a6e")).toBe(ORB_HUES[1])
  })

  it("is null when there is nothing to offer", () => {
    expect(swatchFor([], "#ce8b9f")).toBeNull()
  })
})

describe("readPhotoPalette", () => {
  const file = new Blob(["x"], { type: "image/jpeg" })

  it("reads the photo's pixels and says the swatches come from it", async () => {
    const read: PixelReader = vi.fn(async () => image([[ORANGE, 700], [BLUE, 300]]))
    const out = await readPhotoPalette(file, read)
    expect(read).toHaveBeenCalledWith(file)
    expect(out.fromPhoto).toBe(true)
    expect(out.colors).toHaveLength(2)
  })

  it.each([
    ["cannot be drawn (HEIC in most browsers)", async () => null],
    ["fails to decode", async () => Promise.reject(new Error("EncodingError"))],
    ["throws synchronously", () => {
      throw new Error("no canvas")
    }],
    ["has nothing opaque in it", async () => image([[ORANGE, 100, 0]])],
    ["is empty", async () => new Uint8ClampedArray(0)],
  ] as Array<[string, PixelReader]>)("gives no tones, and says so, when the photo %s (the curated hues stand in)", async (_name, read) => {
    const out = await readPhotoPalette(file, read)
    expect(out).toEqual({ colors: [], fromPhoto: false })
  })

  it("gives no tones in an environment with no canvas (the default reader)", async () => {
    const out = await readPhotoPalette(file)
    expect(out).toEqual({ colors: [], fromPhoto: false })
  })
})
