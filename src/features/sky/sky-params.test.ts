import { describe, expect, it } from "vitest"
import { SKY_DEFAULTS, SKY_PRESETS, resolveSkyParams, skyFallbackGradient } from "./sky-params"

describe("resolveSkyParams", () => {
  it("returns the defaults for crimson, with the planet pinned top-right", () => {
    const p = resolveSkyParams("crimson")
    expect(p).toEqual(SKY_DEFAULTS)
    expect(p.planet).toBe(true)
    expect([p.planetX, p.planetY, p.planetRadius]).toEqual([0.87, 0.2, 0.07])
    expect(p.pixel).toBe(6)
    expect(p.voidColor).toBe("#050309")
  })

  it("layers a preset over the defaults", () => {
    const p = resolveSkyParams("phosphor")
    expect(p.planet).toBe(false)
    expect(p.levels).toBe(5)
    expect(p.hotColor).toBe("#6dff7a")
    expect(p.warp).toBe(SKY_DEFAULTS.warp)
  })

  it("ships every preset the canvas has", () => {
    expect(Object.keys(SKY_PRESETS).sort()).toEqual([
      "abyssal",
      "crimson",
      "periwinkle",
      "phosphor",
      "solar",
      "ultraviolet",
    ])
    expect(resolveSkyParams("solar").planetRadius).toBe(0.09)
  })

  it("builds the periwinkle preset from the palette and leaves the rest at the defaults", () => {
    const p = resolveSkyParams("periwinkle")
    expect(p.voidColor).toBe("#191923")
    expect(p.hazeColor).toBe("#2C2A42")
    expect(p.duskColor).toBe("#3E3A60")
    expect(p.wineColor).toBe("#59518B")
    expect(p.crimsonColor).toBe("#8377D1")
    expect(p.hotColor).toBe("#F3B61F")
    expect(p.starColor).toBe("#FBFEF9")
    expect(p.warp).toBe(SKY_DEFAULTS.warp)
    expect(p.planet).toBe(true)
  })

  it("never uses School Bus Yellow in the periwinkle sky", () => {
    const colors = Object.values(resolveSkyParams("periwinkle")).filter((v) => typeof v === "string")
    expect(colors.map((c) => String(c).toUpperCase())).not.toContain("#FFC600")
  })

  it("applies overrides on top of the preset", () => {
    expect(resolveSkyParams("solar", { warp: 3 }).warp).toBe(3)
  })

  it("accepts a pixel size only inside 2..16", () => {
    expect(resolveSkyParams("crimson", { pixel: 9 }).pixel).toBe(9)
    expect(resolveSkyParams("crimson", { pixel: 1 }).pixel).toBe(6)
    expect(resolveSkyParams("crimson", { pixel: 40 }).pixel).toBe(6)
    expect(resolveSkyParams("crimson", { pixel: Number.NaN }).pixel).toBe(6)
  })

  it("falls back to crimson for an unknown preset", () => {
    expect(resolveSkyParams("nope" as never)).toEqual(SKY_DEFAULTS)
  })

  it("does not mutate the shared defaults", () => {
    resolveSkyParams("abyssal", { pixel: 12 })
    expect(SKY_DEFAULTS.pixel).toBe(6)
  })
})

describe("skyFallbackGradient", () => {
  it("paints the preset ramp over its void color", () => {
    const p = resolveSkyParams("solar")
    const css = skyFallbackGradient(p)
    expect(css).toContain(p.hotColor)
    expect(css).toContain(p.crimsonColor)
    expect(css).toContain(p.wineColor)
    expect(css).toContain(p.duskColor)
    expect(css.endsWith(p.voidColor)).toBe(true)
  })

  it("stands in with palette colors only for the periwinkle sky", () => {
    const css = skyFallbackGradient(resolveSkyParams("periwinkle"))
    expect(css).toContain("#F3B61F")
    expect(css).toContain("#8377D1")
    expect(css.endsWith("#191923")).toBe(true)
    expect(css.toLowerCase()).not.toContain("#050309")
  })
})
