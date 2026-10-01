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
      expect(diameter).toBeGreaterThanOrEqual(150)
      expect(anchor.x).toBeLessThanOrEqual(0.5)
      expect(anchor.y * vp.height - diameter / 2).toBeGreaterThanOrEqual(0)
    }
  })

  it("opens at a zoom inside the camera range", () => {
    expect(OPEN_ZOOM).toBeGreaterThan(1)
    expect(OPEN_ZOOM).toBeLessThanOrEqual(3)
  })
})

describe("glassLayout on a short, wide screen (a phone in landscape)", () => {
  const vp = { width: 844, height: 390 }

  it("puts the caption beside the sphere so nothing falls off the bottom", () => {
    const layout = glassLayout(vp)
    expect(layout.caption).toBe("side")
    expect(layout.anchor.x).toBeLessThan(0.5)
    // The sphere, and the play control that hangs 28 px under it, stay inside the screen.
    expect(layout.anchor.y * vp.height + layout.diameter / 2 + 28).toBeLessThanOrEqual(vp.height - 8)
    expect(layout.anchor.y * vp.height - layout.diameter / 2).toBeGreaterThanOrEqual(48)
  })

  it("keeps the caption below the sphere on portrait phones and desktops", () => {
    for (const v of [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 1440, height: 900 }]) {
      expect(glassLayout(v).caption).toBe("below")
    }
  })
})
