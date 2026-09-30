import { describe, expect, it } from "vitest"
import { GAS_TINTS, PALETTE, STAR_COLORS, STAR_TINT } from "./palette"

describe("PALETTE", () => {
  it("holds the five exact hexes by role", () => {
    expect(PALETTE).toEqual({
      void: "#191923",
      ink: "#FBFEF9",
      periwinkle: "#8377D1",
      gold: "#F3B61F",
      signal: "#FFC600",
    })
  })

  it("derives the gas tints from Shadow Grey toward Periwinkle", () => {
    expect(GAS_TINTS).toEqual({ haze: "#2C2A42", dusk: "#3E3A60", wine: "#59518B" })
  })
})

describe("star colors", () => {
  it("indexes gold, porcelain, periwinkle in that order", () => {
    expect(STAR_COLORS).toEqual(["gold", "ink", "periwinkle"])
    expect(STAR_TINT).toEqual({ gold: 0, ink: 1, periwinkle: 2 })
  })

  it("never offers the School Bus Yellow signal as a star", () => {
    expect(STAR_COLORS).not.toContain("signal")
    expect(STAR_COLORS.map((k) => PALETTE[k])).not.toContain(PALETTE.signal)
  })
})
