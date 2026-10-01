import { SIM_DT, type ConstellationSim } from "./constellation-sim"
import { hash } from "./point-layout"
import type { Edge } from "./similarity"

/** An orb is held still while the pointer is within this many px of its center (about where the magnet captures it). */
export const PIN_RADIUS = 56
/** At most this many fixed steps run in one frame; a longer stall (a slow frame, a busy tab) is dropped, not replayed. */
const MAX_STEPS_PER_FRAME = 4
const MAX_FRAME_S = 0.1
const MAX_DPR = 2

// Edges: a hairline, low alpha, fading with length and tie strength.
const EDGE_ALPHA = 0.34
const EDGE_FADE_LENGTH = 340
const HIGHLIGHT_BOOST = 2.6
const DIM_FACTOR = 0.35
const HIGHLIGHT_EASE_PER_S = 7
// A slow, faint pulse that now and then travels along an edge.
const PULSE_TRAVEL_S = 2.6
const PULSE_PERIOD_S: readonly [number, number] = [18, 46]
const PULSE_ALPHA = 0.42

/** How an orb relates to the one being held: itself, a linked neighbour, or the rest. */
export type LinkState = "idle" | "self" | "near" | "far"

interface LoopOptions {
  sim: ConstellationSim
  edges: readonly Edge[]
  /** `#rrggbb` per orb, in sim order. */
  colors: readonly string[]
  /** One element per orb, in sim order: moved with `transform`. */
  items: readonly HTMLElement[]
  /** The edges' canvas, in stage px at `width` x `height`. */
  canvas: HTMLCanvasElement | null
  width: number
  height: number
  /** One settled, still frame; nothing is scheduled. */
  reduced: boolean
}

export interface ConstellationLoop {
  /** Where an orb is drawn right now, in stage px. */
  positionOf: (index: number) => { x: number; y: number }
  /** The orb under the pointer or holding focus (or null): it is held still, with its links brightened. */
  hold: (source: "hover" | "focus", index: number | null) => void
  /** The pointer in stage px (or null when it left): an orb within `PIN_RADIUS` is held too, like a magnet capture. */
  pointer: (point: { x: number; y: number } | null) => void
  dispose: () => void
}

const hexToRgb = (hex: string): [number, number, number] => {
  const v = Number.parseInt(hex.slice(1), 16)
  return Number.isFinite(v) && /^#[0-9a-f]{6}$/i.test(hex) ? [(v >> 16) & 255, (v >> 8) & 255, v & 255] : [138, 180, 255]
}

/**
 * Drives the orbs and their edges. Orbs stay real DOM elements, moved by `style.transform` from one rAF loop; there
 * is no React state per frame. The simulation runs on a fixed timestep and is drawn extrapolated by the leftover
 * time, so it is smooth on any refresh rate. Each frame costs O(n + edges). It stops while the tab is hidden.
 * Under reduced motion it settles once, synchronously, draws a still frame, and never schedules anything.
 */
export function startConstellation(options: LoopOptions): ConstellationLoop {
  const { sim, edges, colors, items, canvas, width, height, reduced } = options
  const n = sim.count
  const ctx = canvas?.getContext("2d") ?? null
  const dpr = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, MAX_DPR)
  if (canvas && ctx) {
    canvas.width = Math.max(Math.round(width * dpr), 1)
    canvas.height = Math.max(Math.round(height * dpr), 1)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const rgb = colors.map(hexToRgb)
  const pulsePeriod = new Float64Array(edges.length)
  const pulsePhase = new Float64Array(edges.length)
  edges.forEach((e, k) => {
    const h = hash(`${e.a}:${e.b}:pulse`) / 4294967295
    pulsePeriod[k] = PULSE_PERIOD_S[0] + h * (PULSE_PERIOD_S[1] - PULSE_PERIOD_S[0])
    pulsePhase[k] = (hash(`${e.a}:${e.b}:phase`) / 4294967295) * pulsePeriod[k]
  })
  const adjacency: number[][] = Array.from({ length: n }, () => [])
  edges.forEach((e, k) => {
    adjacency[e.a].push(k)
    adjacency[e.b].push(k)
  })

  const drawX = new Float64Array(n)
  const drawY = new Float64Array(n)
  const state: LinkState[] = new Array<LinkState>(n).fill("idle")
  const hot = new Uint8Array(edges.length)
  const held: { hover: number | null; focus: number | null; magnet: number | null } = { hover: null, focus: null, magnet: null }
  let pointerAt: { x: number; y: number } | null = null
  let pinned: number | null = null
  let highlight = 0
  let raf = 0
  let acc = 0
  let last = 0
  let alive = true

  const currentPin = () => held.hover ?? held.focus ?? held.magnet

  const applyPin = () => {
    const next = currentPin()
    if (next === pinned) return
    if (pinned !== null) sim.pinned[pinned] = 0
    pinned = next
    if (pinned !== null) sim.pinned[pinned] = 1
    hot.fill(0)
    const linked = new Set<number>()
    if (pinned !== null) {
      for (const k of adjacency[pinned]) {
        hot[k] = 1
        linked.add(edges[k].a === pinned ? edges[k].b : edges[k].a)
      }
    }
    for (let i = 0; i < n; i++) {
      const link: LinkState = pinned === null ? "idle" : i === pinned ? "self" : linked.has(i) ? "near" : "far"
      if (link === state[i]) continue
      state[i] = link
      items[i]?.firstElementChild?.setAttribute("data-link", link)
    }
  }

  const findMagnet = () => {
    if (!pointerAt) return null
    let best: number | null = null
    let bestD = PIN_RADIUS
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(sim.x[i] - pointerAt.x, sim.y[i] - pointerAt.y)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }

  const place = (lead: number) => {
    for (let i = 0; i < n; i++) {
      // Extrapolate by the leftover time: pinned orbs have zero velocity, so they never slide.
      drawX[i] = sim.x[i] + sim.vx[i] * lead
      drawY[i] = sim.y[i] + sim.vy[i] * lead
      const el = items[i]
      if (el) el.style.transform = `translate3d(${drawX[i].toFixed(2)}px, ${drawY[i].toFixed(2)}px, 0)`
    }
  }

  const drawEdges = (dt: number) => {
    if (!canvas || !ctx) return
    const target = pinned === null ? 0 : 1
    highlight += (target - highlight) * Math.min(1, dt * HIGHLIGHT_EASE_PER_S)
    ctx.clearRect(0, 0, width, height)
    ctx.lineWidth = 1
    for (let k = 0; k < edges.length; k++) {
      const { a, b, weight } = edges[k]
      const ax = drawX[a]
      const ay = drawY[a]
      const bx = drawX[b]
      const by = drawY[b]
      const length = Math.hypot(bx - ax, by - ay)
      const fade = Math.max(0, 1 - length / EDGE_FADE_LENGTH)
      let alpha = EDGE_ALPHA * weight * fade * fade
      alpha *= hot[k] ? 1 + (HIGHLIGHT_BOOST - 1) * highlight : 1 - (1 - DIM_FACTOR) * highlight
      if (alpha < 0.004) continue
      const gradient = ctx.createLinearGradient(ax, ay, bx, by)
      gradient.addColorStop(0, `rgba(${rgb[a][0]},${rgb[a][1]},${rgb[a][2]},${alpha.toFixed(3)})`)
      gradient.addColorStop(1, `rgba(${rgb[b][0]},${rgb[b][1]},${rgb[b][2]},${alpha.toFixed(3)})`)
      ctx.strokeStyle = gradient
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.stroke()
      if (reduced) continue
      const u = ((sim.time + pulsePhase[k]) % pulsePeriod[k]) / PULSE_TRAVEL_S
      if (u < 1) {
        const px = ax + (bx - ax) * u
        const py = ay + (by - ay) * u
        const [r, g, bl] = u < 0.5 ? rgb[a] : rgb[b]
        ctx.fillStyle = `rgba(${r},${g},${bl},${(alpha * (PULSE_ALPHA / EDGE_ALPHA) * Math.sin(Math.PI * u)).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(px, py, 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  const render = (lead: number, dt: number) => {
    place(lead)
    drawEdges(dt)
  }

  const frame = (now: number) => {
    raf = 0
    if (!alive) return
    const dt = Math.min(Math.max((now - last) / 1000, 0), MAX_FRAME_S)
    last = now
    held.magnet = findMagnet()
    applyPin()
    acc += dt
    let steps = 0
    while (acc >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
      sim.step()
      acc -= SIM_DT
      steps++
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0
    render(acc, dt)
    schedule()
  }

  const schedule = () => {
    if (alive && !raf && !reduced && !document.hidden) raf = requestAnimationFrame(frame)
  }
  const stop = () => {
    cancelAnimationFrame(raf)
    raf = 0
  }
  const onVisibility = () => {
    if (document.hidden) stop()
    else {
      last = performance.now()
      schedule()
    }
  }

  if (reduced) {
    sim.settle()
    render(0, 1)
  } else {
    render(0, 1)
    last = performance.now()
    document.addEventListener("visibilitychange", onVisibility)
    schedule()
  }

  return {
    positionOf: (index) => ({ x: drawX[index] ?? sim.x[index], y: drawY[index] ?? sim.y[index] }),
    hold: (source, index) => {
      held[source] = index
      applyPin()
      // Reduced motion has no loop: repaint the still frame so the links answer right away.
      if (reduced) drawEdges(1)
    },
    pointer: (point) => {
      pointerAt = point
      if (reduced) {
        held.magnet = findMagnet()
        applyPin()
        drawEdges(1)
      }
    },
    dispose: () => {
      alive = false
      stop()
      document.removeEventListener("visibilitychange", onVisibility)
      for (let i = 0; i < n; i++) sim.pinned[i] = 0
    },
  }
}
