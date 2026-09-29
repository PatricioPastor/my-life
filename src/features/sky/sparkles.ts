/** Positions are 0..1 stage fractions (y up); `reach` and `core` are fractions of the short side. */
export interface Sparkle {
  x: number
  y: number
  reach: number
  core: number
  tint: number
  phase: number
  born: number
  user: boolean
}

export interface SparkleAnchor {
  x: number
  y: number
}

/** Small seeded PRNG so the layout is the same on every load. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The planet and the bottom-left corner stay free of small sparkles.
const KEEP_CLEAR: SparkleAnchor[] = [
  { x: 0.87, y: 0.2 },
  { x: 0.08, y: 0.95 },
]

const SMALL_COUNT = 6

/** The anchors (facet stars) are the bright sparkles; a few small seeded ones fill the gaps. */
export function layoutSkySparkles(seed: number, anchors: readonly SparkleAnchor[]): Sparkle[] {
  const rand = mulberry32(seed)
  const out: Sparkle[] = anchors.map((a, i) => ({
    x: a.x,
    y: a.y,
    reach: 0.085 + 0.025 * rand(),
    core: 0.012,
    tint: i % 2,
    phase: rand() * 6.283,
    born: -10,
    user: false,
  }))
  const occupied: SparkleAnchor[] = [...anchors, ...KEEP_CLEAR]
  for (let i = 0; i < SMALL_COUNT; i++) {
    let x = 0.5
    let y = 0.5
    for (let tries = 0; tries < 40; tries++) {
      x = 0.06 + 0.88 * rand()
      y = 0.08 + 0.84 * rand()
      if (occupied.concat(out).every((s) => Math.hypot(s.x - x, s.y - y) > 0.15)) break
    }
    out.push({
      x,
      y,
      reach: 0.022 + 0.035 * rand(),
      core: 0.004 + 0.004 * rand(),
      tint: rand() < 0.3 ? 1 : 0,
      phase: rand() * 6.283,
      born: -10,
      user: false,
    })
  }
  return out
}

/** Adds a sparkle; when full, only a visitor's sparkle may be replaced, never a seeded one. */
export function pushSparkle(list: Sparkle[], next: Sparkle, max: number): Sparkle[] {
  if (list.length < max) return list.concat([next])
  const oldest = list.findIndex((s) => s.user)
  if (oldest === -1) return list
  return list.slice(0, oldest).concat(list.slice(oldest + 1), [next])
}
