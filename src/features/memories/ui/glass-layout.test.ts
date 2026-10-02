import { describe, expect, it } from "vitest"
import { CAPTION_BLOCK, LENS_MAX_DPR, OPEN_ZOOM, glassLayout, lensGeometry, playerHeight } from "./glass-layout"

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

describe("glassLayout reserves the room the text under the sphere needs", () => {
  const phones = [
    { width: 360, height: 640 },
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
  ]
  const desktops = [
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]

  it("leaves the player and the whole caption block between the sphere and the bottom, on every phone and desktop", () => {
    for (const vp of [...phones, ...desktops]) {
      const narrow = vp.width < 640
      const { diameter, anchor, caption } = glassLayout(vp)
      expect(caption).toBe("below")
      const bottom = anchor.y * vp.height + diameter / 2
      const needed = playerHeight(narrow) + CAPTION_BLOCK[narrow ? "narrow" : "wide"]
      expect(vp.height - bottom, `${vp.width}x${vp.height}`).toBeGreaterThanOrEqual(needed)
    }
  })

  it("shrinks the sphere, rather than the text, on a short phone", () => {
    const short = glassLayout({ width: 360, height: 640 }).diameter
    const tall = glassLayout({ width: 360, height: 844 }).diameter
    expect(short).toBeLessThan(tall)
  })

  it("keeps the sphere under the top bar", () => {
    for (const vp of [...phones, ...desktops]) {
      const { diameter, anchor } = glassLayout(vp)
      expect(anchor.y * vp.height - diameter / 2, `${vp.width}x${vp.height}`).toBeGreaterThanOrEqual(76)
    }
  })

  it("stacks the progress and the volume on a phone, side by side on a desktop", () => {
    expect(playerHeight(true)).toBeGreaterThan(playerHeight(false))
    expect(playerHeight(false)).toBe(52)
  })

  it("reports the player's height in the geometry the glass lays out from", () => {
    expect(lensGeometry({ width: 390, height: 844 }, 2).player).toBe(playerHeight(true))
    expect(lensGeometry({ width: 1440, height: 900 }, 1).player).toBe(playerHeight(false))
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

describe("lensGeometry: the sphere snapped to the device pixel grid", () => {
  const sizes = [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1366, height: 768 },
    { width: 1278, height: 711 },
  ]
  const ratios = [1, 1.25, 1.5, 2, 2.625, 3]
  const onGrid = (css: number, dpr: number) => Math.abs(css * dpr - Math.round(css * dpr)) < 1e-6

  it("puts the center, the sphere's edges and the canvas on whole device pixels, at every size and ratio", () => {
    for (const vp of sizes)
      for (const dpr of ratios) {
        const lens = lensGeometry(vp, dpr)
        expect(onGrid(lens.center.x, dpr)).toBe(true)
        expect(onGrid(lens.center.y, dpr)).toBe(true)
        expect(onGrid(lens.center.x - lens.diameter / 2, dpr)).toBe(true)
        expect(onGrid(lens.center.y - lens.diameter / 2, dpr)).toBe(true)
        expect(onGrid(lens.canvas.left, dpr)).toBe(true)
        expect(onGrid(lens.canvas.top, dpr)).toBe(true)
        // The canvas backing store is exactly its CSS size in device pixels: nothing is resampled.
        expect(lens.canvas.css * dpr).toBeCloseTo(lens.canvas.device, 6)
        expect(Number.isInteger(lens.canvas.device)).toBe(true)
        expect(lens.canvas.device % 2).toBe(0)
      }
  })

  it("keeps the sphere where the layout wants it, within a device pixel", () => {
    for (const vp of sizes)
      for (const dpr of ratios) {
        const layout = glassLayout(vp)
        const lens = lensGeometry(vp, dpr)
        expect(Math.abs(lens.diameter - layout.diameter)).toBeLessThanOrEqual(1 / dpr + 1e-9)
        expect(Math.abs(lens.center.x - layout.anchor.x * vp.width)).toBeLessThanOrEqual(0.5 / dpr + 1e-9)
        expect(Math.abs(lens.center.y - layout.anchor.y * vp.height)).toBeLessThanOrEqual(0.5 / dpr + 1e-9)
        expect(lens.caption).toBe(layout.caption)
      }
  })

  it("gives the camera the exact center as its anchor", () => {
    const lens = lensGeometry({ width: 1366, height: 768 }, 1.25)
    expect(lens.anchor.x * 1366).toBeCloseTo(lens.center.x, 9)
    expect(lens.anchor.y * 768).toBeCloseTo(lens.center.y, 9)
  })

  it("leaves the canvas a margin all round the sphere for its rim", () => {
    const lens = lensGeometry({ width: 1440, height: 900 }, 2)
    expect(lens.canvas.css).toBeGreaterThan(lens.diameter * 1.05)
    expect(lens.canvas.left + lens.canvas.css / 2).toBeCloseTo(lens.center.x, 9)
  })

  it("draws at the device ratio, up to 3", () => {
    expect(lensGeometry({ width: 390, height: 844 }, 3).dpr).toBe(3)
    expect(lensGeometry({ width: 390, height: 844 }, 4).dpr).toBe(3)
    expect(lensGeometry({ width: 390, height: 844 }, 0).dpr).toBe(1)
    expect(LENS_MAX_DPR).toBe(3)
  })
})
