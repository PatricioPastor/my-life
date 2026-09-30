import { GAS_TINTS, PALETTE } from "@/shared/lib/palette"

export interface SkyParams {
  pixel: number
  dotMin: number
  dotMax: number
  levels: number
  scale: number
  warp: number
  drift: number
  density: number
  threshold: number
  softness: number
  band: number
  bandAngle: number
  bandOffset: number
  bandWidth: number
  haze: number
  stars: number
  twinkle: number
  starDrift: number
  seed: number
  spikeWidth: number
  planet: boolean
  planetX: number
  planetY: number
  planetRadius: number
  parallax: number
  lens: number
  lensRadius: number
  lensPush: number
  rippleSpeed: number
  vignette: number
  grain: number
  voidColor: string
  hazeColor: string
  duskColor: string
  wineColor: string
  crimsonColor: string
  hotColor: string
  starColor: string
}

export type SkyPresetName = "periwinkle" | "crimson" | "ultraviolet" | "abyssal" | "solar" | "phosphor"

// The planet sits top-right in every preset unless a preset resizes or drops it.
export const SKY_DEFAULTS: SkyParams = {
  pixel: 6, dotMin: 0.12, dotMax: 0.56, levels: 7,
  scale: 1.7, warp: 1.5, drift: 0.035, density: 0.5, threshold: 0.54, softness: 0.5,
  band: 0.5, bandAngle: 1.05, bandOffset: 0.42, bandWidth: 0.34, haze: 0.8,
  stars: 1, twinkle: 1.4, starDrift: 1.2, seed: 11, spikeWidth: 1,
  planet: true, planetX: 0.87, planetY: 0.2, planetRadius: 0.07,
  parallax: 1, lens: 0.55, lensRadius: 170, lensPush: 0.3, rippleSpeed: 420,
  vignette: 0.5, grain: 0.035,
  voidColor: "#050309", hazeColor: "#161a38", duskColor: "#3b1646", wineColor: "#5c0d31",
  crimsonColor: "#c01245", hotColor: "#ff1f5a", starColor: "#f6e2e8",
}

export const SKY_PRESETS: Record<SkyPresetName, Partial<SkyParams>> = {
  // The landing's default: Shadow Grey gas rising through Periwinkle to Sunflower Gold, Porcelain stars.
  periwinkle: {
    voidColor: PALETTE.void, hazeColor: GAS_TINTS.haze, duskColor: GAS_TINTS.dusk, wineColor: GAS_TINTS.wine,
    crimsonColor: PALETTE.periwinkle, hotColor: PALETTE.gold, starColor: PALETTE.ink,
  },
  crimson: {},
  ultraviolet: { hazeColor: "#10183f", duskColor: "#2a1a5e", wineColor: "#3d1478", crimsonColor: "#7b2cf0", hotColor: "#c77dff", starColor: "#eef0ff", bandAngle: 2.2, bandOffset: 0.3, seed: 4 },
  abyssal: { voidColor: "#02060a", hazeColor: "#0a1f2e", duskColor: "#0d2f3f", wineColor: "#0a4453", crimsonColor: "#0f8f9f", hotColor: "#3ff2e0", starColor: "#e4fffb", band: 0.5, bandAngle: -0.4, bandOffset: -0.2, seed: 23 },
  solar: { voidColor: "#070403", hazeColor: "#231208", duskColor: "#3d1a07", wineColor: "#6e2406", crimsonColor: "#d8520c", hotColor: "#ffb020", starColor: "#fff3d6", warp: 1.9, band: 0.72, bandAngle: 0.4, planetRadius: 0.09, seed: 5 },
  phosphor: { voidColor: "#020502", hazeColor: "#08170c", duskColor: "#0c2412", wineColor: "#0e3d18", crimsonColor: "#1f9d3a", hotColor: "#6dff7a", starColor: "#e6ffe8", levels: 5, planet: false, seed: 31 },
}

/** defaults < preset < overrides. `pixel` is only honored inside 2..16, like the canvas. */
export function resolveSkyParams(
  preset: SkyPresetName = "crimson",
  overrides: Partial<SkyParams> = {},
): SkyParams {
  const base: SkyParams = { ...SKY_DEFAULTS, ...(SKY_PRESETS[preset] ?? {}) }
  const px = Number(overrides.pixel)
  const pixel = px >= 2 && px <= 16 ? px : base.pixel
  return { ...base, ...overrides, pixel }
}

/** Static CSS stand-in for the shader when WebGL2 is unavailable. */
export function skyFallbackGradient(p: SkyParams): string {
  return (
    `radial-gradient(60% 45% at 12% 88%, ${p.hotColor} 0%, ${p.crimsonColor} 22%, ${p.wineColor} 50%, transparent 75%), ` +
    `radial-gradient(40% 30% at 80% 30%, ${p.duskColor} 0%, transparent 70%), ${p.voidColor}`
  )
}
