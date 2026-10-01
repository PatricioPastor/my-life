export interface Point {
  x: number
  y: number
}

/** A screen-space box in CSS px (y down). */
export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface OrbPathConfig {
  /** Same seed, same viewport, same keep-out: the same path, on every machine. */
  seed: number
  width: number
  height: number
  /** Keep-out boxes (facet stars with their labels, the name mark, the controls). */
  keepOut: readonly Rect[]
  /** Least distance from the orb's center to any keep-out box. */
  clearance: number
  /** Least distance from the orb's center to a viewport edge. */
  margin: number
  /** Average travel speed in px/s. */
  speed?: number
}

export function distanceToRect(p: Point, r: Rect): number {
  const dx = Math.max(r.left - p.x, 0, p.x - r.right)
  const dy = Math.max(r.top - p.y, 0, p.y - r.bottom)
  return Math.hypot(dx, dy)
}

const DEFAULT_SPEED = 22
// How many random candidates a waypoint gets before the rules relax, and in total before it settles.
const STRICT_TRIES = 90
const TOTAL_TRIES = 220
// The path is verified against a slightly larger clearance, sampled finer than any caller will look.
const VERIFY_BUFFER = 4
// Waypoints and straight chords keep extra room, so the curve between them has space to bow.
const CHORD_BUFFER = 18
const VERIFY_STEP_PX = 5
const MIN_LEG_S = 2

/** A 0..1 hash of (seed, waypoint, attempt, lane): murmur-style, so neighbors decorrelate. */
function rand(seed: number, n: number, attempt: number, lane: number): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(n + 0x7f4a7c15, 0x85ebca6b) ^ Math.imul(attempt + 1, 0xc2b2ae35)) | 0
  h = Math.imul(h ^ (h >>> 16) ^ Math.imul(lane + 1, 0x27d4eb2f), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * The orb's wander as a pure function of time: seeded waypoints joined by a C1 cubic Hermite curve, so the
 * velocity never jumps. Each waypoint is drawn so that the whole curve toward it keeps its clearance from
 * every keep-out box and its margin from the viewport. Waypoints build lazily and are cached, so the path
 * is the same whatever order it is sampled in.
 */
export function createOrbPath(config: OrbPathConfig): (t: number) => Point {
  const { seed, width, height, keepOut, clearance, margin } = config
  const speed = config.speed ?? DEFAULT_SPEED

  const loX = Math.min(margin, width / 2)
  const hiX = Math.max(loX, width - margin)
  const loY = Math.min(margin, height / 2)
  const hiY = Math.max(loY, height - margin)
  const span = Math.hypot(hiX - loX, hiY - loY)
  const minLeg = span * 0.22
  const maxLeg = span * 0.6

  const inside = (p: Point) => p.x >= loX - 1e-6 && p.x <= hiX + 1e-6 && p.y >= loY - 1e-6 && p.y <= hiY + 1e-6
  const room = (p: Point, extra = 0) => {
    let least = Infinity
    for (const r of keepOut) least = Math.min(least, distanceToRect(p, r))
    return least - (clearance + extra)
  }
  const valid = (p: Point, extra = 0) => inside(p) && room(p, extra) >= 0

  const pts: Point[] = []
  const ts: number[] = []

  const tangent = (i: number): Point => {
    const a = pts[Math.max(i - 1, 0)]
    const b = pts[Math.min(i + 1, pts.length - 1)]
    const dt = ts[Math.min(i + 1, pts.length - 1)] - ts[Math.max(i - 1, 0)]
    return dt > 0 ? { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt } : { x: 0, y: 0 }
  }

  const hermite = (i: number, time: number): Point => {
    const h = ts[i + 1] - ts[i]
    const s = h > 0 ? Math.min(Math.max((time - ts[i]) / h, 0), 1) : 0
    const s2 = s * s
    const s3 = s2 * s
    const h00 = 2 * s3 - 3 * s2 + 1
    const h10 = s3 - 2 * s2 + s
    const h01 = -2 * s3 + 3 * s2
    const h11 = s3 - s2
    const m0 = tangent(i)
    const m1 = tangent(i + 1)
    const a = pts[i]
    const b = pts[i + 1]
    return {
      x: h00 * a.x + h10 * h * m0.x + h01 * b.x + h11 * h * m1.x,
      y: h00 * a.y + h10 * h * m0.y + h01 * b.y + h11 * h * m1.y,
    }
  }

  /** Least slack (clearance beyond the rule, and margin) along segment `i`; negative means it breaks a rule. */
  const segmentSlack = (i: number): number => {
    const length = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
    const steps = Math.max(16, Math.ceil((length * 1.4) / VERIFY_STEP_PX))
    let least = Infinity
    for (let k = 0; k <= steps; k++) {
      const p = hermite(i, ts[i] + ((ts[i + 1] - ts[i]) * k) / steps)
      const edge = Math.min(p.x - loX, hiX - p.x, p.y - loY, hiY - p.y)
      least = Math.min(least, edge, room(p, VERIFY_BUFFER))
    }
    return least
  }

  const straightSlack = (a: Point, b: Point, buffer: number): number => {
    const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / VERIFY_STEP_PX))
    let least = Infinity
    for (let k = 0; k <= steps; k++) {
      const f = k / steps
      least = Math.min(least, room({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, buffer))
    }
    return least
  }

  // Start where there is the most room to go: a pocket the orb cannot leave would freeze it on a small screen.
  const first = (): Point => {
    const options: Point[] = []
    for (let a = 0; a < 400 && options.length < 40; a++) {
      const p = { x: loX + rand(seed, 0, a, 0) * (hiX - loX), y: loY + rand(seed, 0, a, 1) * (hiY - loY) }
      if (valid(p, CHORD_BUFFER / 2)) options.push(p)
    }
    let best: Point | null = null
    let bestReach = -1
    for (const [index, p] of options.entries()) {
      let reach = 0
      for (let k = 0; k < 40; k++) {
        const q = { x: loX + rand(seed, 1, index * 64 + k, 2) * (hiX - loX), y: loY + rand(seed, 1, index * 64 + k, 3) * (hiY - loY) }
        const leg = Math.hypot(q.x - p.x, q.y - p.y)
        if (leg >= minLeg && leg <= maxLeg && valid(q, CHORD_BUFFER / 2) && straightSlack(p, q, CHORD_BUFFER) >= 0) reach++
      }
      if (reach > bestReach) {
        best = p
        bestReach = reach
      }
    }
    return best ?? { x: (loX + hiX) / 2, y: (loY + hiY) / 2 }
  }

  const extend = () => {
    const n = pts.length
    if (n === 0) {
      pts.push(first())
      ts.push(0)
      return
    }
    const prev = pts[n - 1]
    const before = n >= 2 ? pts[n - 2] : null
    let best: { p: Point; slack: number } | null = null
    for (let a = 0; a < TOTAL_TRIES; a++) {
      const relaxed = a >= STRICT_TRIES
      const p = { x: loX + rand(seed, n, a, 0) * (hiX - loX), y: loY + rand(seed, n, a, 1) * (hiY - loY) }
      const leg = Math.hypot(p.x - prev.x, p.y - prev.y)
      if (leg < minLeg * (relaxed ? 0.4 : 1) || leg > maxLeg * (relaxed ? 1.4 : 1)) continue
      if (!relaxed && before) {
        const dot = ((prev.x - before.x) * (p.x - prev.x) + (prev.y - before.y) * (p.y - prev.y)) /
          Math.max(Math.hypot(prev.x - before.x, prev.y - before.y) * leg, 1e-9)
        if (dot < -0.3) continue
      }
      if (!valid(p, CHORD_BUFFER / 2)) continue
      let slack = straightSlack(prev, p, CHORD_BUFFER)
      if (slack < 0) continue
      pts.push(p)
      ts.push(ts[n - 1] + Math.max(leg / speed, MIN_LEG_S))
      // The curve into the candidate bends the previous segment; judge it with the candidate in place.
      if (n >= 2) slack = Math.min(slack, segmentSlack(n - 2))
      pts.pop()
      ts.pop()
      if (slack >= 0) {
        best = { p, slack }
        break
      }
      if (!best || slack > best.slack) best = { p, slack }
    }
    // With no acceptable candidate the orb idles where it is: always inside the rules, never a jump.
    const next = best ? best.p : prev
    const leg = Math.hypot(next.x - prev.x, next.y - prev.y)
    pts.push(next)
    ts.push(ts[n - 1] + Math.max(leg / speed, MIN_LEG_S))
  }

  /**
   * The planner keeps the curve clear, and this is the exact guarantee behind it. A point that has crept inside
   * a clearance is pushed straight out of that box, and a point past the margin is clamped back. Both are
   * continuous maps, and the curve never nears a box's interior, so the path stays smooth.
   */
  const guard = (p: Point): Point => {
    let q = p
    for (let pass = 0; pass < 4; pass++) {
      let moved = false
      for (const r of keepOut) {
        const nx = Math.min(Math.max(q.x, r.left), r.right)
        const ny = Math.min(Math.max(q.y, r.top), r.bottom)
        const d = Math.hypot(q.x - nx, q.y - ny)
        if (d < clearance && d > 1e-9) {
          q = { x: nx + ((q.x - nx) / d) * clearance, y: ny + ((q.y - ny) / d) * clearance }
          moved = true
        }
      }
      q = { x: Math.min(Math.max(q.x, loX), hiX), y: Math.min(Math.max(q.y, loY), hiY) }
      if (!moved) break
    }
    return q
  }

  return (time: number): Point => {
    const t = Number.isFinite(time) && time > 0 ? time : 0
    if (pts.length === 0) extend()
    while (ts[ts.length - 1] <= t || pts.length < 3) extend()
    // Segment i holds t; its end tangent needs waypoint i + 2 to exist.
    let lo = 0
    let hi = pts.length - 2
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (ts[mid] <= t) lo = mid
      else hi = mid - 1
    }
    while (pts.length < lo + 3) extend()
    return guard(hermite(lo, t))
  }
}
