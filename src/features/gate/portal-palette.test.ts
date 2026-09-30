import { describe, expect, it } from "vitest"
import { hexToRgb } from "@/shared/lib/color"
import { PORTAL as SHARED } from "@/shared/lib/palette"
import { PORTAL } from "./portal-palette"

const lum = (hex: string) => {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe("PORTAL palette", () => {
  it("is the one shared palette the sky also reads", () => {
    expect(PORTAL).toBe(SHARED)
  })

  it("holds the four exact ring colors and Coffee Bean", () => {
    expect(PORTAL.rings).toEqual(["#FFC15E", "#F7B05B", "#F7934C", "#CC5803"])
    expect(PORTAL.coffee).toBe("#1F1300")
  })

  it("has a background darker than Coffee Bean, and coffee-tinted rather than grey", () => {
    expect(lum(PORTAL.deep)).toBeLessThan(lum(PORTAL.coffee))
    const [r, g, b] = hexToRgb(PORTAL.deep)
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThanOrEqual(b)
  })

  it("derives the background as a third of Coffee Bean per channel", () => {
    const c = hexToRgb(PORTAL.coffee).map((v) => Math.round((v * 255) / 3))
    const d = hexToRgb(PORTAL.deep).map((v) => Math.round(v * 255))
    expect(d).toEqual(c)
  })
})
