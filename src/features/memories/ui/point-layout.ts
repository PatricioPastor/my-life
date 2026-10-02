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
export function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: a small seeded generator, so a given id always draws the same numbers. */
export function rng(seed: number): () => number {
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

/** How far from its parent a new related orb starts, in world px (a little over the orbs' resting gap). */
export const SPAWN_DISTANCE = 64

/**
 * Where a new orb starts next to its parent: `SPAWN_DISTANCE` away, in a direction drawn from its own id (so two new
 * orbs of one parent do not stack), and pulled back inside the margins when the parent sits near an edge.
 */
export function spawnNear(
  id: string,
  parent: { x: number; y: number },
  area: Pick<LayoutArea, "width" | "height" | "margin">,
): { x: number; y: number } {
  const angle = rng(hash(`${id}:spawn`))() * Math.PI * 2
  const minX = area.margin
  const maxX = Math.max(area.width - area.margin, minX)
  const minY = area.margin
  const maxY = Math.max(area.height - area.margin, minY)
  return {
    x: Math.min(Math.max(parent.x + Math.cos(angle) * SPAWN_DISTANCE, minX), maxX),
    y: Math.min(Math.max(parent.y + Math.sin(angle) * SPAWN_DISTANCE, minY), maxY),
  }
}

/**
 * Where each orb starts the simulation: where it already was (`kept`), else next to its related parent (a new memory
 * contributed from another lands beside it, at the position its parent was carried to when there is one), else where the
 * seeded layout put it. The result is by index, like `ids`.
 */
export function startPositions(
  ids: readonly string[],
  relatedIds: ReadonlyArray<string | null>,
  laid: readonly PlacedPoint[],
  kept: ReadonlyMap<string, { x: number; y: number }> | null,
  area: Pick<LayoutArea, "width" | "height" | "margin">,
): { x: number[]; y: number[] } {
  const indexOf = new Map(ids.map((id, index) => [id, index]))
  const placed = new Map<number, { x: number; y: number }>()

  // Resolved in dependency order: a parent spawned in this same pass is placed before its child, so a chain A <- B <- C
  // lands C beside where B was just put. `visiting` guards a cycle (the one that closes it falls back to the layout).
  const resolve = (i: number, visiting: ReadonlySet<number>): { x: number; y: number } => {
    const done = placed.get(i)
    if (done) return done
    let at = kept?.get(ids[i])
    if (!at) {
      const related = relatedIds[i]
      const parentIndex = related ? indexOf.get(related) : undefined
      if (related && parentIndex !== undefined && parentIndex !== i && !visiting.has(parentIndex)) {
        const parent = kept?.get(related) ?? resolve(parentIndex, new Set(visiting).add(i))
        at = spawnNear(ids[i], parent, area)
      } else {
        at = { x: laid[i].x, y: laid[i].y }
      }
    }
    placed.set(i, at)
    return at
  }

  const x: number[] = []
  const y: number[] = []
  ids.forEach((_, i) => {
    const at = resolve(i, new Set())
    x.push(at.x)
    y.push(at.y)
  })
  return { x, y }
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
