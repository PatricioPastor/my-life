import { describe, expect, it } from "vitest"
import { TANGENT_GLYPHS, gridFor, MAX_CELLS, tangentIndex } from "./glyphs"

// Screen coordinates: x right, y down. (dx, dy) is the cell's offset from the vanishing point.
const at = (deg: number) => {
  const a = (deg * Math.PI) / 180
  return tangentIndex(Math.cos(a), Math.sin(a))
}
const glyph = (deg: number) => TANGENT_GLYPHS[at(deg)]

describe("tangentIndex", () => {
  it("draws the top and bottom of a ring flat", () => {
    expect(glyph(270)).toBe("-")
    expect(glyph(90)).toBe("-")
  })

  it("draws the left and right of a ring upright", () => {
    expect(glyph(0)).toBe("|")
    expect(glyph(180)).toBe("|")
  })

  it("follows the arc on the diagonals", () => {
    // Upper-right of a ring runs down and to the right, like a backslash.
    expect(glyph(315)).toBe("\\")
    expect(glyph(135)).toBe("\\")
    // Upper-left runs up and to the right, like a slash.
    expect(glyph(225)).toBe("/")
    expect(glyph(45)).toBe("/")
  })

  it("is point-symmetric and only ever yields one of the four glyphs", () => {
    for (let deg = 0; deg < 360; deg += 3) {
      expect(at(deg)).toBe(at(deg + 180))
      expect(at(deg)).toBeGreaterThanOrEqual(0)
      expect(at(deg)).toBeLessThan(TANGENT_GLYPHS.length)
    }
  })

  it("reads the vanishing point itself as flat instead of failing", () => {
    expect(TANGENT_GLYPHS[tangentIndex(0, 0)]).toBeDefined()
  })
})

describe("gridFor", () => {
  const cells = (w: number, h: number) => {
    const g = gridFor(w, h)
    return Math.ceil(w / g.cw) * Math.ceil(h / g.ch)
  }

  it("is finer on desktop than on a phone", () => {
    const desktop = gridFor(1440, 900)
    const phone = gridFor(390, 844)
    expect(desktop.cw).toBeLessThan(phone.cw)
    expect(desktop.ch).toBeLessThan(phone.ch)
  })

  it("keeps the cell count bounded on any screen", () => {
    for (const [w, h] of [
      [320, 568],
      [390, 844],
      [639, 900],
      [640, 480],
      [1440, 900],
      [1920, 1080],
      [2560, 1440],
      [3840, 2160],
    ]) {
      expect(cells(w, h)).toBeLessThanOrEqual(MAX_CELLS * 1.05)
    }
  })

  it("scales the glyph with the cell", () => {
    expect(gridFor(3840, 2160).font).toBeGreaterThan(gridFor(1440, 900).font)
  })

  it("survives a zero-size stage", () => {
    const g = gridFor(0, 0)
    expect(g.cw).toBeGreaterThan(0)
    expect(g.ch).toBeGreaterThan(0)
  })
})
