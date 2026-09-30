import { hexToRgb } from "@/shared/lib/color"
import { PORTAL } from "./portal-palette"

// Rings live at whole steps of depth u = (DEPTH / r) * DEPTH_GAIN + phase and race outward as phase grows.
const DEPTH = 0.32
const DEPTH_GAIN = 1.25
/** Radius (fraction of the short side) just outside the vanishing point, where a new ring is born. */
const BIRTH_RADIUS = 0.03
/** Share of a ring's color kept when it is dimmed over the background. */
export const DIM_SHARE = 0.35

/** Depth into the tunnel at radius `r`; the ring index is its floor. */
export function ringDepth(r: number, phase: number): number {
  return (DEPTH / r) * DEPTH_GAIN + phase
}

/** The ring that will next be born at the vanishing point, so the center glow can foreshadow its color. */
export function nextRingIndex(phase: number, birthRadius: number = BIRTH_RADIUS): number {
  return Math.floor(ringDepth(birthRadius, phase)) + 1
}

/** `fg` laid over `bg` at `share` (0..1), as an uppercase hex. */
export function mixHex(fg: string, bg: string, share: number): string {
  const a = hexToRgb(fg)
  const b = hexToRgb(bg)
  const channel = (i: number) =>
    Math.round((a[i] * share + b[i] * (1 - share)) * 255)
      .toString(16)
      .padStart(2, "0")
  return `#${channel(0)}${channel(1)}${channel(2)}`.toUpperCase()
}

/** The fixed dim level of a ring color: mixed over the portal background, precomputed once per color. */
export function dimTint(color: string, bg: string = PORTAL.deep): string {
  return mixHex(color, bg, DIM_SHARE)
}
