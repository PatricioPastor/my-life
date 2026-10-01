import { describe, expect, it } from "vitest"
import { formatClock, glassMotion, hexToUnit, pickGlassMode } from "./glass-mode"

describe("pickGlassMode", () => {
  it("uses WebGL when the browser has WebGL2", () => {
    expect(pickGlassMode({ webgl2: true })).toBe("webgl")
  })

  it("falls back to the CSS glass without it", () => {
    expect(pickGlassMode({ webgl2: false })).toBe("css")
  })

  it("falls back when the GL view could not be built or was lost", () => {
    expect(pickGlassMode({ webgl2: true, failed: true })).toBe("css")
  })
})

describe("glassMotion", () => {
  it("ripples the surface and lights the glow with the voice", () => {
    expect(glassMotion(0.8, false)).toEqual({ warp: 0.8, glow: 0.8 })
  })

  it("never deforms under reduced motion, and only gives a gentle glow", () => {
    const m = glassMotion(1, true)
    expect(m.warp).toBe(0)
    expect(m.glow).toBeGreaterThan(0)
    expect(m.glow).toBeLessThan(0.6)
  })

  it("is dark and still in silence, in both modes", () => {
    expect(glassMotion(0, false)).toEqual({ warp: 0, glow: 0 })
    expect(glassMotion(0, true)).toEqual({ warp: 0, glow: 0 })
  })

  it("keeps the level in range", () => {
    expect(glassMotion(7, false).warp).toBe(1)
    expect(glassMotion(-3, false).glow).toBe(0)
  })
})

describe("hexToUnit", () => {
  it("reads a #rrggbb color as 0..1 channels", () => {
    expect(hexToUnit("#ff8000")).toEqual([1, 128 / 255, 0])
  })

  it("falls back to a soft blue for anything that is not a color", () => {
    expect(hexToUnit("nope")).toEqual(hexToUnit("#8ab4ff"))
  })
})

describe("formatClock", () => {
  it("shows minutes and seconds", () => {
    expect(formatClock(7000)).toBe("0:07")
    expect(formatClock(65000)).toBe("1:05")
    expect(formatClock(120000)).toBe("2:00")
  })

  it("rounds to the nearest second and never goes negative", () => {
    expect(formatClock(1499)).toBe("0:01")
    expect(formatClock(1500)).toBe("0:02")
    expect(formatClock(-40)).toBe("0:00")
    expect(formatClock(Number.NaN)).toBe("0:00")
  })
})
