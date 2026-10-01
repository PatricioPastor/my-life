/** What a seeded depth does to one orb. */
export interface OrbMetrics {
  /** Diameter of the bright body, in px. */
  size: number
  /** Overall brightness, 0..1. */
  alpha: number
  /** 0 is crisp, 1 is a soft haze: far orbs are out of focus. */
  softness: number
  /** How much of the point's drift it takes: nearer orbs swing wider. */
  driftScale: number
}

function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** A stable depth for this memory: 0 is far away, 1 is close. */
export function orbDepth(id: string): number {
  return hash(`${id}:depth`) / 4294967295
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Size, brightness, focus and drift from depth, so the constellation sits at different distances. */
export function orbMetrics(depth: number): OrbMetrics {
  const z = Math.min(Math.max(depth, 0), 1)
  return {
    size: lerp(9, 16, z),
    alpha: lerp(0.58, 1, z),
    softness: lerp(0.8, 0.15, z),
    driftScale: lerp(0.6, 1.4, z),
  }
}
