import { describe, expect, it } from "vitest"
import { chooseOrbColor, colorDistance, hexToOklch, isGlowColor } from "./orb-color"
import { ORB_HUES, ORB_HUE_NAMES, orbHueFor, randomOrbHue } from "./orb-hues"

/** Two swatches closer than this in OKLab look like the same color: the picker's near-duplicate rule. */
const NEAR_DUPLICATE = 0.06

const hueOf = (hex: string) => hexToOklch(hex)[2]

describe("ORB_HUES (the curated orb palette)", () => {
  it("is twelve distinct lowercase #rrggbb colors", () => {
    expect(ORB_HUES).toHaveLength(12)
    expect(new Set(ORB_HUES).size).toBe(12)
    for (const hex of ORB_HUES) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })

  it("glows on the void: every hue passes the server's floor", () => {
    for (const hex of ORB_HUES) expect(isGlowColor(hex), hex).toBe(true)
  })

  it("is accepted unchanged by the server when the visitor picks it", () => {
    for (const hex of ORB_HUES) expect(chooseOrbColor(hex, null)).toBe(hex)
  })

  it("goes all the way around the wheel, warm and cool, with no gap wider than 40 degrees", () => {
    const hues = ORB_HUES.map(hueOf).sort((a, b) => a - b)
    const gaps = hues.map((hue, index) => (hues[(index + 1) % hues.length] - hue + 360) % 360)
    expect(Math.max(...gaps)).toBeLessThanOrEqual(40)
  })

  it(`keeps every pair apart (OKLab distance of at least ${NEAR_DUPLICATE}), so none reads as another`, () => {
    for (const [i, a] of ORB_HUES.entries()) {
      for (const b of ORB_HUES.slice(i + 1)) expect(colorDistance(a, b), `${a} ${b}`).toBeGreaterThanOrEqual(NEAR_DUPLICATE)
    }
  })

  it("is one family: lightness within 0.74..0.86 and chroma within 0.12..0.145", () => {
    for (const hex of ORB_HUES) {
      const [l, c] = hexToOklch(hex)
      expect(l, hex).toBeGreaterThanOrEqual(0.735)
      expect(l, hex).toBeLessThanOrEqual(0.865)
      expect(c, hex).toBeGreaterThanOrEqual(0.12)
      expect(c, hex).toBeLessThanOrEqual(0.145)
    }
  })

  it("was chosen inside sRGB: no channel sits at the edge, where a clipped color would", () => {
    for (const hex of ORB_HUES) {
      for (const channel of [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)]) {
        expect(channel, hex).not.toBe("00")
        expect(channel, hex).not.toBe("ff")
      }
    }
  })

  it("gives each hue its own short Spanish name", () => {
    const names = ORB_HUES.map((hex) => ORB_HUE_NAMES[hex])
    expect(names).toEqual([
      "rosa",
      "coral",
      "ámbar",
      "limón",
      "verde",
      "menta",
      "turquesa",
      "cielo",
      "azul",
      "lavanda",
      "violeta",
      "magenta",
    ])
  })
})

describe("randomOrbHue", () => {
  it("draws one of the curated hues from the random source it is given", () => {
    expect(randomOrbHue(() => 0)).toBe(ORB_HUES[0])
    expect(randomOrbHue(() => 0.5)).toBe(ORB_HUES[6])
    expect(randomOrbHue(() => 0.9999)).toBe(ORB_HUES[11])
  })

  it("stays inside the palette even if the source answers exactly 1", () => {
    expect(randomOrbHue(() => 1)).toBe(ORB_HUES[11])
  })

  it("uses Math.random when no source is given", () => {
    expect(ORB_HUES).toContain(randomOrbHue())
  })
})

describe("orbHueFor (the stable hue of a memory with no color of its own)", () => {
  const ids = Array.from({ length: 1200 }, (_, i) => `${i.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`)

  it("answers a curated hue, and always the same one for the same id", () => {
    for (const id of ids.slice(0, 50)) {
      expect(ORB_HUES).toContain(orbHueFor(id))
      expect(orbHueFor(id)).toBe(orbHueFor(id))
    }
  })

  it("never changes for a given id, so a memory keeps its color across releases", () => {
    expect(orbHueFor("11111111-1111-4111-8111-111111111111")).toBe(ORB_HUES[PINNED_ONE])
    expect(orbHueFor("")).toBe(ORB_HUES[PINNED_EMPTY])
  })

  it("spreads ids across the whole palette, so colorless memories do not all look alike", () => {
    const counts = new Map<string, number>()
    for (const id of ids) counts.set(orbHueFor(id), (counts.get(orbHueFor(id)) ?? 0) + 1)
    expect(counts.size).toBe(12)
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(50)
      expect(count).toBeLessThan(150)
    }
  })
})

// FNV-1a (32 bit) of the id's UTF-16 code units, modulo 12, computed outside the module once and pinned here:
// 3508788259 % 12 and 2166136261 (the offset basis) % 12.
const PINNED_ONE = 7
const PINNED_EMPTY = 1
