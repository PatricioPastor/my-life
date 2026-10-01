import { describe, expect, it } from "vitest"
import { oklchToSrgb, toHex } from "./oklch"
import { ORB_HUE_MAX, ORB_HUE_MIN, ORB_PERIOD_S, orbColor } from "./orb-color"

const inGamut = (rgb: readonly number[]) => rgb.every((v) => v >= 0 && v <= 1)

describe("oklchToSrgb", () => {
  it("maps black and white", () => {
    expect(oklchToSrgb(0, 0, 0).map((v) => Math.round(v * 255))).toEqual([0, 0, 0])
    expect(oklchToSrgb(1, 0, 0).map((v) => Math.round(v * 255))).toEqual([255, 255, 255])
  })

  it("brings an out-of-gamut chroma back inside sRGB by lowering chroma only", () => {
    // Saturated cyan at this lightness is far outside sRGB.
    const rgb = oklchToSrgb(0.78, 0.4, 195)
    expect(inGamut(rgb)).toBe(true)
    // Hue is kept: cyan stays green/blue led, with red the weakest channel.
    expect(rgb[0]).toBeLessThan(rgb[1])
    expect(rgb[0]).toBeLessThan(rgb[2])
  })

  it("formats a hex string", () => {
    expect(toHex([1, 0, 0.5])).toBe("#ff0080")
  })
})

describe("orbColor", () => {
  it("has a period of about 12 seconds", () => {
    expect(ORB_PERIOD_S).toBeGreaterThanOrEqual(10)
    expect(ORB_PERIOD_S).toBeLessThanOrEqual(14)
    for (const t of [0, 1.3, 5, 9.9]) {
      const a = orbColor(t)
      const b = orbColor(t + ORB_PERIOD_S)
      expect(b.hue).toBeCloseTo(a.hue, 6)
      a.rgb.forEach((v, i) => expect(b.rgb[i]).toBeCloseTo(v, 6))
    }
  })

  it("stays inside the cool hue range, and reaches both ends of it", () => {
    let lo = Infinity
    let hi = -Infinity
    for (let t = 0; t < ORB_PERIOD_S * 3; t += 0.05) {
      const { hue } = orbColor(t)
      lo = Math.min(lo, hue)
      hi = Math.max(hi, hue)
    }
    expect(lo).toBeGreaterThanOrEqual(ORB_HUE_MIN - 1e-9)
    expect(hi).toBeLessThanOrEqual(ORB_HUE_MAX + 1e-9)
    expect(lo).toBeLessThan(ORB_HUE_MIN + 2)
    expect(hi).toBeGreaterThan(ORB_HUE_MAX - 2)
    // Cyan to magenta: no warm hue (red, orange, yellow, green) is ever visited.
    expect(ORB_HUE_MIN).toBeGreaterThan(180)
    expect(ORB_HUE_MAX).toBeLessThan(345)
  })

  it("starts cyan, goes through violet and reaches magenta halfway", () => {
    expect(orbColor(0).hue).toBeCloseTo(ORB_HUE_MIN, 6)
    expect(orbColor(ORB_PERIOD_S / 2).hue).toBeCloseTo(ORB_HUE_MAX, 6)
    const quarter = orbColor(ORB_PERIOD_S / 4).hue
    expect(quarter).toBeGreaterThan(250)
    expect(quarter).toBeLessThan(285)
  })

  it("is always inside sRGB, with a hex that matches", () => {
    for (let t = 0; t < ORB_PERIOD_S; t += 0.1) {
      const c = orbColor(t)
      expect(inGamut(c.rgb)).toBe(true)
      expect(c.hex).toBe(toHex(c.rgb))
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it("is luminous enough for the dark sky and never neon", () => {
    for (let t = 0; t < ORB_PERIOD_S; t += 0.25) {
      const [r, g, b] = orbColor(t).rgb
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
      expect(luma).toBeGreaterThan(0.3)
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(0.85)
    }
  })

  it("changes smoothly between frames", () => {
    let prev = orbColor(0).rgb
    for (let t = 1 / 60; t < ORB_PERIOD_S; t += 1 / 60) {
      const next = orbColor(t).rgb
      next.forEach((v, i) => expect(Math.abs(v - prev[i])).toBeLessThan(0.01))
      prev = next
    }
  })
})
