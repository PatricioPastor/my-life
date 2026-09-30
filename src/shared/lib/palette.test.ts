import { describe, expect, it } from "vitest"
import { EMBER_GAS, GAS_TINTS, PALETTE, PORTAL, STAR_COLORS, STAR_HEX, STAR_TINT } from "./palette"

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

describe("PORTAL", () => {
  it("holds the ring colors, Coffee Bean and the near-black background", () => {
    expect(PORTAL.rings).toEqual(["#FFC15E", "#F7B05B", "#F7934C", "#CC5803"])
    expect(PORTAL.coffee).toBe("#1F1300")
    expect(PORTAL.deep).toBe("#0A0600")
  })
})

describe("EMBER_GAS", () => {
  it("builds the gas ramp from the portal palette only", () => {
    expect(EMBER_GAS).toEqual({
      haze: "#1F1300",
      dusk: "#532801",
      wine: "#CC5803",
      crimson: "#F7934C",
      hot: "#FFC15E",
    })
  })
})

describe("star colors", () => {
  it("indexes the four ring colors gold, clay, sandy, bronze in that order", () => {
    expect(STAR_COLORS).toEqual(["gold", "clay", "sandy", "bronze"])
    expect(STAR_TINT).toEqual({ gold: 0, clay: 1, sandy: 2, bronze: 3 })
    expect(STAR_COLORS.map((k) => STAR_HEX[k])).toEqual([...PORTAL.rings])
  })

  it("never offers the School Bus Yellow signal as a star", () => {
    expect(Object.values(STAR_HEX)).not.toContain(PALETTE.signal)
  })
})
