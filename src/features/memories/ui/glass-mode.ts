/** Small pure decisions behind the glass orb view: which renderer, how the voice moves it, and its color and clock. */

import { GLASS } from "./glass-config"

/** The WebGL canvas is this much bigger than the sphere: room for its thin rim bloom (the halo is drawn in CSS). */
export const CANVAS_SCALE = GLASS.canvasScale

/** WebGL2 draws the refracting glass (the lens); without it, or if it fails or is lost, a CSS glass circle stands in. */
export type GlassMode = "webgl" | "css"

export interface GlassMotion {
  /** How much the surface ripples and deforms, 0..1. */
  warp: number
  /** How strongly the inner light and halo glow, 0..1. */
  glow: number
}

/** Under reduced motion there is no deformation at all, only a gentler glow that follows the level. */
const REDUCED_GLOW = 0.45

/** What the voice level does to the glass: a ripple and a glow, or only a quiet glow under reduced motion. */
export function glassMotion(level: number, reduced: boolean): GlassMotion {
  const l = Math.min(Math.max(Number.isFinite(level) ? level : 0, 0), 1)
  return reduced ? { warp: 0, glow: l * REDUCED_GLOW } : { warp: l, glow: l }
}

const FALLBACK_TINT = "#8ab4ff"

/** `#rrggbb` as 0..1 channels (a soft blue for anything else). */
export function hexToUnit(hex: string): [number, number, number] {
  const valid = /^#[0-9a-f]{6}$/i.test(hex) ? hex : FALLBACK_TINT
  const v = Number.parseInt(valid.slice(1), 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

/** `m:ss` for a duration in milliseconds. */
export function formatClock(ms: number): string {
  const total = Number.isFinite(ms) ? Math.max(Math.round(ms / 1000), 0) : 0
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}
