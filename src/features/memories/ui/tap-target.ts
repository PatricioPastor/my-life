import type { Point } from "./camera"

/** How far (screen px) a finger may land from an orb's center and still mean that orb: the orb hit area's radius. */
export const TAP_RADIUS = 22

export interface OrbCenter extends Point {
  id: string
}

/**
 * The orb a tap meant: the one whose center is closest to the finger. On a phone the overview packs orbs closer than
 * a fingertip, and their hit areas overlap, so the browser would hand the tap to whichever is drawn on top.
 */
export function nearestOrb(at: Point, orbs: readonly OrbCenter[], radius = TAP_RADIUS): string | null {
  let best: string | null = null
  let bestDistance = radius
  for (const orb of orbs) {
    const distance = Math.hypot(orb.x - at.x, orb.y - at.y)
    if (distance <= bestDistance) {
      best = orb.id
      bestDistance = distance
    }
  }
  return best
}
