/** One mote of dust. Positions are fractions of the stage; sizes are CSS px. */
export interface DustParticle {
  /** Where it starts, in 0..1. */
  x: number
  y: number
  /** Depth layer: 0 is the farthest. */
  layer: number
  radius: number
  /** 0 is a crisp dot, 1 a very soft bokeh (the layers stay under 0.4). */
  softness: number
  alpha: number
  /** Drift, as stage fractions per second. */
  vx: number
  vy: number
  /** The most the pointer parallax moves it, in px. */
  parallax: number
  /** Index into the tint list. */
  tint: number
}

interface DustLayer {
  share: number
  radius: readonly [number, number]
  softness: number
  alpha: readonly [number, number]
  /** Stage fractions per second. */
  speed: number
  parallax: number
}

/**
 * Three depths. Far dust is a tiny, crisp, nearly still point; near dust is a little bigger and drifts faster and
 * answers the pointer more, so the void has volume. All of it is small and sharp: dust is a texture, never a blur
 * over the orbs.
 */
export const DUST_LAYERS: readonly DustLayer[] = [
  { share: 0.55, radius: [0.5, 0.9], softness: 0.05, alpha: [0.3, 0.5], speed: 0.0016, parallax: 4 },
  { share: 0.3, radius: [0.8, 1.4], softness: 0.2, alpha: [0.3, 0.55], speed: 0.0035, parallax: 10 },
  { share: 0.15, radius: [1.3, 2.2], softness: 0.4, alpha: [0.2, 0.4], speed: 0.0065, parallax: 22 },
]

export const DUST_TINTS = 3

/** mulberry32: a small seeded generator. */
function rng(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const between = (next: () => number, [lo, hi]: readonly [number, number]) => lo + next() * (hi - lo)

/** A seeded, deterministic dust field: the same seed and count always make the same motes. */
export function makeDust(seed: number, count: number): DustParticle[] {
  const next = rng(seed)
  const particles: DustParticle[] = []
  for (let i = 0; i < count; i++) {
    const roll = next()
    let layer = 0
    for (let acc = 0, l = 0; l < DUST_LAYERS.length; l++) {
      acc += DUST_LAYERS[l].share
      if (roll < acc || l === DUST_LAYERS.length - 1) {
        layer = l
        break
      }
    }
    const spec = DUST_LAYERS[layer]
    // Mostly rising, with a slow sideways lean, so the field reads as suspended rather than falling.
    const heading = -Math.PI / 2 + (next() - 0.5) * 1.6
    const speed = spec.speed * (0.7 + next() * 0.6)
    particles.push({
      x: next() * 0.999999,
      y: next() * 0.999999,
      layer,
      radius: between(next, spec.radius),
      softness: spec.softness,
      alpha: between(next, spec.alpha),
      vx: Math.cos(heading) * speed,
      vy: Math.sin(heading) * speed,
      parallax: spec.parallax,
      tint: Math.floor(next() * DUST_TINTS),
    })
  }
  return particles
}

const wrap = (v: number) => v - Math.floor(v)

/** Where a mote is `seconds` after the start, wrapped into the unit square. A pure function of time. */
export function dustPositionAt(p: DustParticle, seconds: number): { x: number; y: number } {
  return { x: wrap(p.x + p.vx * seconds), y: wrap(p.y + p.vy * seconds) }
}

const PHONE_PX = 640
// The field is about 40% of what it used to be, so the orbs always read first.
const AREA_PER_MOTE = 22_500
const DESKTOP_COUNT: readonly [number, number] = [36, 60]
const PHONE_MAX = 24

/** How many motes to draw: a sparse texture on a desktop, fewer still on a phone where fill rate is scarce. */
export function dustCount(width: number, height: number): number {
  const area = Math.max(width, 320) * Math.max(height, 480)
  const base = Math.round(area / AREA_PER_MOTE)
  return width < PHONE_PX ? Math.min(base, PHONE_MAX) : Math.min(Math.max(base, DESKTOP_COUNT[0]), DESKTOP_COUNT[1])
}

/** Where the sprite's solid core ends, as a fraction of its radius: nearly the whole disc, so the edge is sharp. */
export function spriteCoreStop(softness: number): number {
  return 0.45 + 0.45 * (1 - Math.min(Math.max(softness, 0), 1))
}

/** Half the drawn size of a mote in px: barely past its radius, a little more as it softens. */
export function dustReach(p: Pick<DustParticle, "radius" | "softness">): number {
  return p.radius * (1.15 + p.softness * 1.2)
}
