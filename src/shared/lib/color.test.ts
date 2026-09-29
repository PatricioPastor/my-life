import { describe, expect, it } from "vitest"
import { hexToRgb, rgba } from "./color"

describe("hexToRgb", () => {
  it("parses 6-digit hex into 0..1 channels", () => {
    expect(hexToRgb("#ff0000")).toEqual([1, 0, 0])
    const [r, g, b] = hexToRgb("#050309")
    expect(r).toBeCloseTo(5 / 255)
    expect(g).toBeCloseTo(3 / 255)
    expect(b).toBeCloseTo(9 / 255)
  })

  it("expands 3-digit hex and tolerates a missing hash or padding", () => {
    expect(hexToRgb("#f0a")).toEqual(hexToRgb("#ff00aa"))
    expect(hexToRgb("  00ff00 ")).toEqual([0, 1, 0])
  })

  it("falls back to black for invalid input", () => {
    expect(hexToRgb("nope")).toEqual([0, 0, 0])
    expect(hexToRgb("#12345")).toEqual([0, 0, 0])
    expect(hexToRgb("")).toEqual([0, 0, 0])
    expect(hexToRgb(undefined as unknown as string)).toEqual([0, 0, 0])
  })
})

describe("rgba", () => {
  it("builds a CSS rgba() string from a hex color", () => {
    expect(rgba("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)")
    expect(rgba("#f0a", 1)).toBe("rgba(255, 0, 170, 1)")
  })

  it("uses black for invalid colors", () => {
    expect(rgba("nope", 0.2)).toBe("rgba(0, 0, 0, 0.2)")
  })
})
