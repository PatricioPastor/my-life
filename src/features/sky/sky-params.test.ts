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
      "phosphor",
      "solar",
      "ultraviolet",
    ])
    expect(resolveSkyParams("solar").planetRadius).toBe(0.09)
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
})
