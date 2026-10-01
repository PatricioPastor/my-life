/** A screen-space box in CSS px (y down). */
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

export interface LayoutArea {
  width: number
  height: number
  /** Points stay at least this far from every edge. */
  margin: number
  /** Preferred minimum distance between two points. */
  spacing: number
  /** Boxes no point may sit in. */
  keepOut: readonly Box[]
}

export interface PlacedPoint {
  id: string
  x: number
  y: number
}

export interface Drift {
  /** Half-travel of the wobble, in px. */
  dx: number
  dy: number
  /** Seconds for one swing. */
  duration: number
  /** Seconds, zero or negative so every point is already mid-swing on arrival. */
  delay: number
}

const ATTEMPTS = 48

/** FNV-1a: a stable 32-bit hash of a string. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: a small seeded generator, so a given id always draws the same numbers. */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const inBox = (x: number, y: number, b: Box) => x > b.left && x < b.right && y > b.top && y < b.bottom

/**
 * Seeded layout of one point per id over the stage. Points are placed greedily in the given order and
 * each draws its own candidates from its id, so placing more points after the existing ones never moves
 * them: append new memories to keep the constellation still. A candidate must sit inside the margins,
 * outside every keep-out box and at least `spacing` from the points before it; when the space is too
 * crowded for that, the candidate farthest from its neighbours wins.
 */
export function layoutPoints(ids: readonly string[], area: LayoutArea): PlacedPoint[] {
  const minX = area.margin
  const maxX = Math.max(area.width - area.margin, minX)
  const minY = area.margin
  const maxY = Math.max(area.height - area.margin, minY)
  const placed: PlacedPoint[] = []

  for (const id of ids) {
    const next = rng(hash(id))
    let best = { x: minX, y: minY, score: -1 }
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const x = minX + next() * (maxX - minX)
      const y = minY + next() * (maxY - minY)
      if (area.keepOut.some((b) => inBox(x, y, b))) continue
      let nearest = Infinity
      for (const p of placed) nearest = Math.min(nearest, Math.hypot(p.x - x, p.y - y))
      if (nearest >= area.spacing) {
        best = { x, y, score: Infinity }
        break
      }
      if (nearest > best.score) best = { x, y, score: nearest }
    }
    placed.push({ id, x: best.x, y: best.y })
  }
  return placed
}

/** A gentle, slow wobble for one point, seeded by its id. */
export function driftFor(id: string): Drift {
  const next = rng(hash(`${id}:drift`))
  const sign = () => (next() < 0.5 ? -1 : 1)
  const duration = 8 + next() * 7
  return {
    dx: sign() * (3 + next() * 6),
    dy: sign() * (3 + next() * 6),
    duration,
    delay: -next() * duration,
  }
}

/** A stable pick from a palette of `length` colors for this id. */
export function paletteIndex(id: string, length: number): number {
  return hash(`${id}:color`) % Math.max(length, 1)
}
