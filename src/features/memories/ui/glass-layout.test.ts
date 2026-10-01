import { describe, expect, it } from "vitest"
import { OPEN_ZOOM, glassLayout } from "./glass-layout"

describe("glassLayout", () => {
  it("is a big sphere on a desktop, limited by the height", () => {
    const { diameter } = glassLayout({ width: 1440, height: 900 })
    expect(diameter).toBeGreaterThan(450)
    expect(diameter).toBeLessThanOrEqual(640)
    expect(diameter).toBeLessThanOrEqual(900 * 0.62 + 1)
  })

  it("fits a phone with margin on the sides and room under it for the caption", () => {
    const vp = { width: 390, height: 844 }
    const { diameter, anchor } = glassLayout(vp)
    expect(diameter).toBeLessThan(vp.width)
    const bottom = anchor.y * vp.height + diameter / 2
    expect(vp.height - bottom).toBeGreaterThanOrEqual(150)
  })

  it("keeps the sphere clear of the top edge and within the screen on every size", () => {
    for (const vp of [
      { width: 360, height: 640 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
    ]) {
      const { diameter, anchor } = glassLayout(vp)
      expect(diameter).toBeGreaterThanOrEqual(200)
      expect(anchor.x).toBe(0.5)
      expect(anchor.y * vp.height - diameter / 2).toBeGreaterThanOrEqual(0)
    }
  })

  it("opens at a zoom inside the camera range", () => {
    expect(OPEN_ZOOM).toBeGreaterThan(1)
    expect(OPEN_ZOOM).toBeLessThanOrEqual(3)
  })
})
