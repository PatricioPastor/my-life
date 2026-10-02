import { describe, expect, it } from "vitest"
import {
  GLASS,
  cubicBezier,
  glassEase,
  lensRadius,
  magnificationAt,
  outerAlpha,
  specularAt,
  specularPeak,
} from "./glass-config"

describe("the lens", () => {
  it("barely magnifies the middle: the photo reads at its own size, crisp", () => {
    expect(magnificationAt(0)).toBeGreaterThanOrEqual(1)
    expect(magnificationAt(0)).toBeLessThanOrEqual(1.1)
  })

  it("leaves the inner part of the sphere undistorted (a straight scale)", () => {
    for (const r of [0.1, 0.3, 0.5, GLASS.lens.rimStart - 0.01]) {
      expect(magnificationAt(r)).toBeCloseTo(magnificationAt(0), 6)
    }
  })

  it("refracts only near the rim, where it gathers more of the photo", () => {
    expect(magnificationAt(0.97)).toBeLessThan(magnificationAt(0) * 0.85)
    expect(GLASS.lens.rimStart).toBeGreaterThanOrEqual(0.55)
  })

  it("never looks past the edge of the photo, so the rim never smears", () => {
    expect(lensRadius(1)).toBeLessThanOrEqual(1 + 1e-9)
    expect(lensRadius(1)).toBeGreaterThan(0.97)
  })

  it("is smooth and always moves outward (no folds, no seams)", () => {
    let prev = -1
    for (let i = 0; i <= 200; i++) {
      const p = lensRadius(i / 200)
      expect(p).toBeGreaterThan(prev)
      prev = p
    }
    // No kink where the rim begins: the slope just inside and just outside agree.
    const r0 = GLASS.lens.rimStart
    expect(magnificationAt(r0 + 1e-4)).toBeCloseTo(magnificationAt(r0 - 1e-4), 3)
  })

  it("keeps the color fringes subtle and only at the rim", () => {
    expect(GLASS.dispersion).toBeGreaterThan(0)
    expect(GLASS.dispersion).toBeLessThanOrEqual(0.015)
  })
})

describe("the highlights", () => {
  it("is a small, soft highlight, never a white blob over the photo", () => {
    expect(specularPeak()).toBeLessThanOrEqual(0.35)
    expect(specularPeak()).toBeGreaterThan(0.12)
    // Small: where it is still a quarter of its peak it spans under 15% of the sphere's width along the rim, and
    // under 8% across it (the sphere is 2 units wide).
    const [sx, sy] = GLASS.specular.at
    const r = Math.hypot(sx, sy)
    const [ux, uy] = [sx / r, sy / r]
    const span = (dx: number, dy: number) => {
      let count = 0
      for (let i = -500; i <= 500; i++) {
        const t = i / 1000
        if (specularAt(sx + dx * t, sy + dy * t) > specularPeak() * 0.25) count++
      }
      return count / 1000
    }
    expect(span(-uy, ux)).toBeLessThan(0.3)
    expect(span(ux, uy)).toBeLessThan(0.16)
  })

  it("sits near the upper left rim, away from the subject in the middle", () => {
    const [x, y] = GLASS.specular.at
    const r = Math.hypot(x, y)
    expect(r).toBeGreaterThan(0.55)
    expect(r).toBeLessThan(0.88)
    expect(x).toBeLessThan(0)
    expect(y).toBeGreaterThan(0)
    expect(specularAt(0, 0)).toBeLessThan(0.01)
  })

  it("has a faint secondary across from it", () => {
    const [x, y] = GLASS.specular.secondaryAt
    expect(x).toBeGreaterThan(0)
    expect(y).toBeLessThan(0)
    // Faint: on the dark body of a voice it must not read as a second blob.
    expect(GLASS.specular.secondaryPeak).toBeLessThanOrEqual(0.06)
  })

  it("keeps the fresnel rim subtle", () => {
    expect(GLASS.fresnel).toBeGreaterThan(0)
    expect(GLASS.fresnel).toBeLessThanOrEqual(0.3)
  })
})

describe("no clipping at the canvas edge", () => {
  const aa = 0.004

  it("fades the rim bloom to nothing well inside the canvas", () => {
    const edge = 1 + GLASS.bloom.width + aa
    expect(outerAlpha(edge, aa)).toBe(0)
    expect(edge).toBeLessThan(GLASS.canvasScale - 0.03)
  })

  it("is fully transparent along the whole canvas border, corners included", () => {
    const s = GLASS.canvasScale
    for (let i = 0; i <= 64; i++) {
      const t = -1 + (2 * i) / 64
      // A point on each side of the square border, in sphere units.
      for (const [x, y] of [[t * s, s], [t * s, -s], [s, t * s], [-s, t * s]]) {
        expect(outerAlpha(Math.hypot(x, y), aa)).toBe(0)
      }
    }
  })

  it("is opaque inside the sphere and soft across its edge", () => {
    expect(outerAlpha(0.5, aa)).toBe(1)
    expect(outerAlpha(1, aa)).toBeGreaterThan(0)
    expect(outerAlpha(1, aa)).toBeLessThan(1)
  })
})

describe("easing", () => {
  it("solves a CSS cubic bezier exactly at its ends and monotonically between", () => {
    const ease = cubicBezier(0.23, 1, 0.32, 1)
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
    let prev = 0
    for (let i = 1; i <= 50; i++) {
      const v = ease(i / 50)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
    // A strong ease-out: most of the change happens early.
    expect(ease(0.25)).toBeGreaterThan(0.6)
  })

  it("opens the glass with the strong ease-out the rest of the interface uses", () => {
    expect(glassEase(0.25)).toBeCloseTo(cubicBezier(0.23, 1, 0.32, 1)(0.25), 9)
  })
})
