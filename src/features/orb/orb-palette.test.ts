import { describe, expect, it } from "vitest"
import { hexToRgb } from "@/shared/lib/color"
import { PORTAL } from "@/shared/lib/palette"
import { ORB_PORTAL } from "./orb-palette"

const luma = (hex: string) => {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe("ORB_PORTAL", () => {
  it("is a tunnel palette of cool, distinct ring colors", () => {
    expect(ORB_PORTAL.rings.length).toBeGreaterThanOrEqual(3)
    expect(new Set(ORB_PORTAL.rings).size).toBe(ORB_PORTAL.rings.length)
    for (const hex of ORB_PORTAL.rings) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/)
      const [r, , b] = hexToRgb(hex)
      // Cool: red never leads blue by more than magenta's pinkish edge, so no ring reads warm.
      expect(r).toBeLessThanOrEqual(b + 0.05)
    }
  })

  it("shares none of the warm portal's colors", () => {
    for (const hex of ORB_PORTAL.rings) expect(PORTAL.rings).not.toContain(hex)
    expect(ORB_PORTAL.deep).not.toBe(PORTAL.deep)
  })

  it("fades into a near-black that keeps the site's depth", () => {
    expect(luma(ORB_PORTAL.deep)).toBeLessThan(0.04)
    for (const hex of ORB_PORTAL.rings) expect(luma(hex)).toBeGreaterThan(luma(ORB_PORTAL.deep) * 6)
  })
})
