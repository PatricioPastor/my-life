import type { Box } from "./point-layout"
import { hash, rng } from "./point-layout"
import type { Edge } from "./similarity"

/** The fixed timestep, in seconds. The simulation never sees a variable one, so a given input always plays out the same. */
export const SIM_DT = 1 / 60
/** The fastest an orb ever moves, in px per second. Calm on purpose. */
export const MAX_SPEED = 48
/** The most steps `settle` takes before giving up on equilibrium (12 s of simulated time). */
export const SETTLE_MAX_STEPS = 720

// Wander: each orb is nudged by two slow sinusoids per axis (periods of 10 to 35 s), seeded by its own id. Pure
// functions of time, so there is no random state to drift out of sync and no allocation per step.
const WANDER_ACCEL = 12
// Velocity decay per second: with the wander above it settles into a gentle 6 to 12 px/s drift.
const DAMPING = 1.3

// Collisions: orbs keep `RADIUS + RADIUS + GAP` between their centers (a button is 44 px wide).
const RADIUS = 20
const GAP = 10
const MIN_DIST = RADIUS * 2 + GAP
const SEPARATION_ACCEL_PER_PX = 60
// Personal space: a faint, longer-range push so unrelated orbs that pass close nudge each other apart.
const PERSONAL_SPACE = 96
const PERSONAL_ACCEL = 14

// Springs: related memories settle `REST_FAR` apart at the threshold and `REST_NEAR` apart when they are nearly the same.
const SPRING_ACCEL_PER_PX = 3.2
const REST_NEAR = 72
const REST_FAR = 170
const WEIGHT_LOW = 0.35
const MAX_STRETCH = 220

// Keep-outs and bounds: a soft push inside a band, plus a hard guarantee that a center never sits inside.
const SOFT_BAND = 36
const BOUNDS_ACCEL = 120
const KEEP_OUT_ACCEL = 160

// Settling for reduced motion: no wander, heavier damping and a higher speed cap, until nothing moves.
const SETTLE_DAMPING = DAMPING * 3
const SETTLE_SPEED = MAX_SPEED * 2.5
const SETTLE_QUIET_SPEED = 0.05
const SETTLE_QUIET_STEPS = 12

export interface SimArea {
  width: number
  height: number
  /** Orbs stay at least this far from every edge. */
  margin: number
  keepOut: readonly Box[]
}

interface SimInput {
  ids: readonly string[]
  /** Where each orb starts, in stage px. */
  x: readonly number[]
  y: readonly number[]
  edges: readonly Edge[]
  area: SimArea
}

export interface ConstellationSim {
  readonly count: number
  /** Positions and velocities in stage px (and px per second), by index into `ids`. Read them; do not write. */
  readonly x: Float64Array
  readonly y: Float64Array
  readonly vx: Float64Array
  readonly vy: Float64Array
  /** Set an entry to 1 to hold that orb still (hovered, focused or captured); it still pushes the others. */
  readonly pinned: Uint8Array
  /** Simulated seconds. */
  time: number
  /** Advances one fixed step. */
  step: () => void
  /** Runs to near-equilibrium without wander, at most `SETTLE_MAX_STEPS` steps; returns how many ran. */
  settle: () => number
}

const springRest = (weight: number) => {
  const t = Math.min(Math.max((weight - WEIGHT_LOW) / (1 - WEIGHT_LOW), 0), 1)
  return REST_FAR + (REST_NEAR - REST_FAR) * t
}

/**
 * A small deterministic force simulation for the memory orbs. Each step is O(n + edges + nearby pairs): a uniform
 * grid keeps the collision pass local. The forces are an entropic wander, soft collisions, springs along the
 * edges, repulsion from the keep-out boxes and the viewport edges, with damping and a speed cap so it can never
 * explode. A center is also hard-projected out of every keep-out box and into the margins after each step.
 */
export function createSim({ ids, x: x0, y: y0, edges, area }: SimInput): ConstellationSim {
  const n = ids.length
  const x = Float64Array.from(x0)
  const y = Float64Array.from(y0)
  const vx = new Float64Array(n)
  const vy = new Float64Array(n)
  const ax = new Float64Array(n)
  const ay = new Float64Array(n)
  const pinned = new Uint8Array(n)

  // Wander parameters, eight per orb: x (w1, p1, w2, p2) then y (w1, p1, w2, p2).
  const wander = new Float64Array(n * 8)
  for (let i = 0; i < n; i++) {
    const next = rng(hash(`${ids[i]}:wander`))
    for (let k = 0; k < 2; k++) {
      const o = i * 8 + k * 4
      wander[o] = 0.18 + next() * 0.28
      wander[o + 1] = next() * Math.PI * 2
      wander[o + 2] = 0.36 + next() * 0.4
      wander[o + 3] = next() * Math.PI * 2
    }
  }

  const edgeA = Int32Array.from(edges, (e) => e.a)
  const edgeB = Int32Array.from(edges, (e) => e.b)
  const edgeRest = Float64Array.from(edges, (e) => springRest(e.weight))

  const minX = area.margin
  const maxX = Math.max(area.width - area.margin, minX)
  const minY = area.margin
  const maxY = Math.max(area.height - area.margin, minY)

  // The collision grid: cells of the personal-space size, counting-sorted each step into `order`.
  const cell = PERSONAL_SPACE
  const cols = Math.max(Math.ceil(area.width / cell), 1)
  const rows = Math.max(Math.ceil(area.height / cell), 1)
  const cellStart = new Int32Array(cols * rows + 1)
  const cellOf = new Int32Array(n)
  const order = new Int32Array(n)
  const colOf = (px: number) => Math.min(Math.max(Math.floor(px / cell), 0), cols - 1)
  const rowOf = (py: number) => Math.min(Math.max(Math.floor(py / cell), 0), rows - 1)

  let wanderScale = 1
  let damping = DAMPING
  let maxSpeed = MAX_SPEED

  const sim: ConstellationSim = {
    count: n,
    x,
    y,
    vx,
    vy,
    pinned,
    time: 0,
    step,
    settle,
  }

  function applyWander() {
    if (wanderScale === 0) return
    const t = sim.time
    const a = WANDER_ACCEL * wanderScale
    for (let i = 0; i < n; i++) {
      const o = i * 8
      ax[i] += a * (0.7 * Math.sin(wander[o] * t + wander[o + 1]) + 0.5 * Math.sin(wander[o + 2] * t + wander[o + 3]))
      ay[i] += a * (0.7 * Math.sin(wander[o + 4] * t + wander[o + 5]) + 0.5 * Math.sin(wander[o + 6] * t + wander[o + 7]))
    }
  }

  function applyPairs() {
    cellStart.fill(0)
    for (let i = 0; i < n; i++) {
      const c = rowOf(y[i]) * cols + colOf(x[i])
      cellOf[i] = c
      cellStart[c + 1]++
    }
    for (let c = 0; c < cols * rows; c++) cellStart[c + 1] += cellStart[c]
    // `cursor` reuses the tail of the prefix sums as insertion heads.
    const heads = cellStart.slice(0, cols * rows)
    for (let i = 0; i < n; i++) order[heads[cellOf[i]]++] = i

    for (let i = 0; i < n; i++) {
      const cx = colOf(x[i])
      const cy = rowOf(y[i])
      for (let gy = Math.max(cy - 1, 0); gy <= Math.min(cy + 1, rows - 1); gy++) {
        for (let gx = Math.max(cx - 1, 0); gx <= Math.min(cx + 1, cols - 1); gx++) {
          const c = gy * cols + gx
          for (let s = cellStart[c]; s < cellStart[c + 1]; s++) {
            const j = order[s]
            if (j <= i) continue
            let dx = x[i] - x[j]
            let dy = y[i] - y[j]
            let d = Math.hypot(dx, dy)
            if (d >= PERSONAL_SPACE) continue
            if (d < 1e-6) {
              // On top of each other: split along a fixed, index-derived direction.
              const angle = (i * 2.399963 + j) % (Math.PI * 2)
              dx = Math.cos(angle)
              dy = Math.sin(angle)
              d = 1e-6
            } else {
              dx /= d
              dy /= d
            }
            let push = PERSONAL_ACCEL * (1 - d / PERSONAL_SPACE)
            if (d < MIN_DIST) push += SEPARATION_ACCEL_PER_PX * (MIN_DIST - d)
            ax[i] += dx * push
            ay[i] += dy * push
            ax[j] -= dx * push
            ay[j] -= dy * push
          }
        }
      }
    }
  }

  function applySprings() {
    for (let e = 0; e < edgeA.length; e++) {
      const a = edgeA[e]
      const b = edgeB[e]
      const dx = x[b] - x[a]
      const dy = y[b] - y[a]
      const d = Math.hypot(dx, dy)
      if (d < 1e-6) continue
      const stretch = Math.min(Math.max(d - edgeRest[e], -MAX_STRETCH), MAX_STRETCH)
      const pull = SPRING_ACCEL_PER_PX * stretch
      ax[a] += (dx / d) * pull
      ay[a] += (dy / d) * pull
      ax[b] -= (dx / d) * pull
      ay[b] -= (dy / d) * pull
    }
  }

  function applyWalls() {
    for (let i = 0; i < n; i++) {
      const px = x[i]
      const py = y[i]
      if (px < minX + SOFT_BAND) ax[i] += BOUNDS_ACCEL * Math.min((minX + SOFT_BAND - px) / SOFT_BAND, 1)
      if (px > maxX - SOFT_BAND) ax[i] -= BOUNDS_ACCEL * Math.min((px - (maxX - SOFT_BAND)) / SOFT_BAND, 1)
      if (py < minY + SOFT_BAND) ay[i] += BOUNDS_ACCEL * Math.min((minY + SOFT_BAND - py) / SOFT_BAND, 1)
      if (py > maxY - SOFT_BAND) ay[i] -= BOUNDS_ACCEL * Math.min((py - (maxY - SOFT_BAND)) / SOFT_BAND, 1)
      for (const box of area.keepOut) {
        const nx = px - Math.min(Math.max(px, box.left), box.right)
        const ny = py - Math.min(Math.max(py, box.top), box.bottom)
        const d = Math.hypot(nx, ny)
        if (d >= SOFT_BAND) continue
        const push = KEEP_OUT_ACCEL * (1 - d / SOFT_BAND)
        if (d > 0) {
          // Outside the box: straight away from its nearest point.
          ax[i] += (nx / d) * push
          ay[i] += (ny / d) * push
        } else {
          // Inside it (only after a drag or a resize): out through the nearest side.
          const toLeft = px - box.left
          const toRight = box.right - px
          const toTop = py - box.top
          const toBottom = box.bottom - py
          const nearest = Math.min(toLeft, toRight, toTop, toBottom)
          if (nearest === toLeft) ax[i] -= KEEP_OUT_ACCEL
          else if (nearest === toRight) ax[i] += KEEP_OUT_ACCEL
          else if (nearest === toTop) ay[i] -= KEEP_OUT_ACCEL
          else ay[i] += KEEP_OUT_ACCEL
        }
      }
    }
  }

  /** The hard guarantee: a center is never inside a keep-out box and never past the margins. */
  function constrain(i: number) {
    for (let pass = 0; pass < 2; pass++) {
      for (const box of area.keepOut) {
        if (!(x[i] > box.left && x[i] < box.right && y[i] > box.top && y[i] < box.bottom)) continue
        const toLeft = x[i] - box.left
        const toRight = box.right - x[i]
        const toTop = y[i] - box.top
        const toBottom = box.bottom - y[i]
        const nearest = Math.min(toLeft, toRight, toTop, toBottom)
        if (nearest === toLeft) {
          x[i] = box.left
          vx[i] = Math.min(vx[i], 0)
        } else if (nearest === toRight) {
          x[i] = box.right
          vx[i] = Math.max(vx[i], 0)
        } else if (nearest === toTop) {
          y[i] = box.top
          vy[i] = Math.min(vy[i], 0)
        } else {
          y[i] = box.bottom
          vy[i] = Math.max(vy[i], 0)
        }
      }
      if (x[i] < minX) {
        x[i] = minX
        vx[i] = Math.max(vx[i], 0)
      } else if (x[i] > maxX) {
        x[i] = maxX
        vx[i] = Math.min(vx[i], 0)
      }
      if (y[i] < minY) {
        y[i] = minY
        vy[i] = Math.max(vy[i], 0)
      } else if (y[i] > maxY) {
        y[i] = maxY
        vy[i] = Math.min(vy[i], 0)
      }
    }
  }

  function step() {
    ax.fill(0)
    ay.fill(0)
    applyWander()
    applyPairs()
    applySprings()
    applyWalls()
    const decay = Math.exp(-damping * SIM_DT)
    for (let i = 0; i < n; i++) {
      if (pinned[i]) {
        vx[i] = 0
        vy[i] = 0
        continue
      }
      let nvx = (vx[i] + ax[i] * SIM_DT) * decay
      let nvy = (vy[i] + ay[i] * SIM_DT) * decay
      const v = Math.hypot(nvx, nvy)
      if (v > maxSpeed) {
        nvx *= maxSpeed / v
        nvy *= maxSpeed / v
      }
      vx[i] = nvx
      vy[i] = nvy
      x[i] += nvx * SIM_DT
      y[i] += nvy * SIM_DT
      constrain(i)
    }
    sim.time += SIM_DT
  }

  function settle() {
    wanderScale = 0
    damping = SETTLE_DAMPING
    maxSpeed = SETTLE_SPEED
    let steps = 0
    let quiet = 0
    while (steps < SETTLE_MAX_STEPS && quiet < SETTLE_QUIET_STEPS) {
      step()
      steps++
      let fastest = 0
      for (let i = 0; i < n; i++) fastest = Math.max(fastest, Math.hypot(vx[i], vy[i]))
      quiet = fastest < SETTLE_QUIET_SPEED ? quiet + 1 : 0
    }
    wanderScale = 1
    damping = DAMPING
    maxSpeed = MAX_SPEED
    vx.fill(0)
    vy.fill(0)
    return steps
  }

  return sim
}
