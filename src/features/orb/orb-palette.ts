import type { TunnelPalette } from "@/features/gate"
import { oklchToSrgb, toHex } from "./oklch"

const ring = (l: number, hue: number) => toHex(oklchToSrgb(l, 0.13, hue))

/**
 * The tunnel's colors for the trip to the memories space: the orb's cool range (cyan, periwinkle, violet,
 * magenta), darker toward the end so the rings keep their depth, over a near-black with a violet cast.
 * The same shape as the warm portal, so the tunnel is tinted rather than forked.
 */
export const ORB_PORTAL: TunnelPalette = {
  rings: [ring(0.8, 195), ring(0.74, 240), ring(0.68, 285), ring(0.62, 330)],
  deep: toHex(oklchToSrgb(0.13, 0.025, 285)),
}
