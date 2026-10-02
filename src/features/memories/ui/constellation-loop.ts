import { orbScale, worldToScreen, type Camera } from "./camera"
import { SIM_DT, type ConstellationSim } from "./constellation-sim"
import { loopShouldRun } from "./loop-gate"
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
/** The orb's photo disc, in CSS px at scale 1 (the `.mem-thumb` size). */
const THUMB_PX = 40

/** How an orb relates to the one being held: itself, a linked neighbour, or the rest. */
export type LinkState = "idle" | "self" | "near" | "far"

interface LoopOptions {
  /** The simulation, in world px. */
  sim: ConstellationSim
  edges: readonly Edge[]
  /** `#rrggbb` per orb, in sim order. */
  colors: readonly string[]
  /** One element per orb, in sim order: moved with `transform`. */
  items: readonly HTMLElement[]
  /** The edges' canvas, in screen px at `width` x `height` (the viewport). */
  canvas: HTMLCanvasElement | null
  width: number
  height: number
  /** The camera, read every frame: the simulation runs in world space and is drawn through it. */
  camera: () => Camera
  /** Called at the start of every frame with its length in seconds, before anything is drawn (the camera advances here). */
  onFrame?: (dt: number) => void
  /** One settled, still frame; nothing is scheduled. */
  reduced: boolean
  /**
   * The approach disc: laid out at the glass diameter, it is moved onto the orb being approached and scaled to its size
   * every frame (never above 1), and marked `data-on` while there is one.
   */
  disc?: HTMLElement | null
}

export interface ConstellationLoop {
  /** Where an orb is in the world right now. */
  positionOf: (index: number) => { x: number; y: number }
  /** Where an orb is drawn right now, in screen px. */
  screenOf: (index: number) => { x: number; y: number }
  /**
   * The orb under the pointer or holding focus (or null): it is held still, with its links brightened. The approach
   * holds the orb being opened, so it does not drift away while the camera flies to it.
   */
  hold: (source: "hover" | "focus" | "approach", index: number | null) => void
  /** The pointer in screen px (or null when it left): an orb within `PIN_RADIUS` is held too, like a magnet capture. */
  pointer: (point: { x: number; y: number } | null) => void
  /** Grows one orb toward `diameter` px as `amount` goes 0..1 (the approach): its photo shows, and the glass takes over. */
  emphasize: (index: number | null, amount: number, diameter: number) => void
  /** The viewport changed size. */
  resize: (width: number, height: number) => void
  /** Draws the current frame again without stepping the simulation (the camera moved while nothing else did). */
  redraw: () => void
  /** Stops asking for frames while something opaque covers the canvas (the glass view), and resumes after. */
  pause: (paused: boolean) => void
  dispose: () => void
}

const hexToRgb = (hex: string): [number, number, number] => {
  const v = Number.parseInt(hex.slice(1), 16)
  return Number.isFinite(v) && /^#[0-9a-f]{6}$/i.test(hex) ? [(v >> 16) & 255, (v >> 8) & 255, v & 255] : [138, 180, 255]
}

/**
 * Drives the orbs and their edges. Orbs stay real DOM elements, moved by `style.transform` from one rAF loop; there
 * is no React state per frame. The simulation runs in world space on a fixed timestep and is drawn extrapolated by the
 * leftover time, through the camera, so it is smooth on any refresh rate. Each frame costs O(n + edges). It stops
 * while the tab is hidden. Under reduced motion it settles once, synchronously, draws a still frame, and never
 * schedules anything: the camera asks it to `redraw` when it moves.
 */
export function startConstellation(options: LoopOptions): ConstellationLoop {
  const { sim, edges, colors, items, canvas, reduced, camera, onFrame, disc } = options
  let { width, height } = options
  const n = sim.count
  const ctx = canvas?.getContext("2d") ?? null
  const dpr = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, MAX_DPR)
  const sizeCanvas = () => {
    if (!canvas || !ctx) return
    canvas.width = Math.max(Math.round(width * dpr), 1)
    canvas.height = Math.max(Math.round(height * dpr), 1)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  sizeCanvas()

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

  // Where each orb is drawn, in screen px, and where it is in the world.
  const drawX = new Float64Array(n)
  const drawY = new Float64Array(n)
  const worldX = new Float64Array(n)
  const worldY = new Float64Array(n)
  const state: LinkState[] = new Array<LinkState>(n).fill("idle")
  const hot = new Uint8Array(edges.length)
  const held: { hover: number | null; focus: number | null; magnet: number | null; approach: number | null } = {
    hover: null,
    focus: null,
    magnet: null,
    approach: null,
  }
  let emphasis: { index: number; amount: number; diameter: number } | null = null
  let focused: number | null = null
  let pointerAt: { x: number; y: number } | null = null
  let pinned: number | null = null
  let highlight = 0
  let raf = 0
  let acc = 0
  let last = 0
  let alive = true

  const currentPin = () => held.approach ?? held.hover ?? held.focus ?? held.magnet

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
      const d = Math.hypot(drawX[i] - pointerAt.x, drawY[i] - pointerAt.y)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }

  const place = (lead: number) => {
    const cam = camera()
    const viewport = { width, height }
    const scale = orbScale(cam.zoom)
    for (let i = 0; i < n; i++) {
      // Extrapolate by the leftover time. A pinned orb is drawn exactly where it is held (its velocity is only zeroed
      // by the next step, and the camera aims at this very point).
      const ahead = sim.pinned[i] ? 0 : lead
      worldX[i] = sim.x[i] + sim.vx[i] * ahead
      worldY[i] = sim.y[i] + sim.vy[i] * ahead
      const at = worldToScreen(cam, viewport, { x: worldX[i], y: worldY[i] })
      drawX[i] = at.x
      drawY[i] = at.y
      // The orb itself keeps its size: the approach disc grows in its place.
      const el = items[i]
      if (el) el.style.transform = `translate3d(${at.x.toFixed(2)}px, ${at.y.toFixed(2)}px, 0) scale(${scale.toFixed(3)})`
    }
    // The approached orb hands over to its disc from the first frame of the approach: its photo shows at once.
    const now = emphasis ? emphasis.index : null
    if (disc) {
      if (now !== null && emphasis) {
        // Laid out at the glass diameter and scaled down to the orb: at arrival it is exactly the sphere, unscaled.
        const full = emphasis.diameter
        const base = THUMB_PX * scale
        const size = base + Math.max(full - base, 0) * emphasis.amount
        disc.style.transform = `translate3d(${(drawX[now] - full / 2).toFixed(2)}px, ${(drawY[now] - full / 2).toFixed(2)}px, 0) scale(${(size / full).toFixed(4)})`
        if (disc.dataset.on !== "true") disc.dataset.on = "true"
      } else if (disc.dataset.on === "true") disc.dataset.on = "false"
    }
    if (now !== focused) {
      const before = focused !== null ? items[focused]?.firstElementChild : null
      if (before) {
        before.removeAttribute("data-focus")
        ;(before as HTMLElement).style.setProperty("--focus", "0")
      }
      if (now !== null) items[now]?.firstElementChild?.setAttribute("data-focus", "true")
      focused = now
    }
    // How far the orb has come in (0..1): it stops breathing, since its drift would be scaled up with it.
    if (focused !== null && emphasis) (items[focused]?.firstElementChild as HTMLElement | undefined)?.style.setProperty("--focus", emphasis.amount.toFixed(3))
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
      // Both ends past the same side of the screen: nothing to draw.
      if ((ax < 0 && bx < 0) || (ay < 0 && by < 0) || (ax > width && bx > width) || (ay > height && by > height)) continue
      // The fade follows the length in the world, so a tie looks the same however far the camera is.
      const length = Math.hypot(worldX[b] - worldX[a], worldY[b] - worldY[a])
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
    onFrame?.(dt)
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

  let paused = false
  const schedule = () => {
    if (!raf && loopShouldRun({ alive, reduced, hidden: document.hidden, paused })) raf = requestAnimationFrame(frame)
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
    positionOf: (index) =>
      sim.pinned[index] ? { x: sim.x[index], y: sim.y[index] } : { x: worldX[index] ?? sim.x[index], y: worldY[index] ?? sim.y[index] },
    screenOf: (index) => ({ x: drawX[index] ?? 0, y: drawY[index] ?? 0 }),
    emphasize: (index, amount, diameter) => {
      emphasis = index === null ? null : { index, amount, diameter }
      if (reduced) place(0)
    },
    resize: (nextWidth, nextHeight) => {
      width = nextWidth
      height = nextHeight
      sizeCanvas()
      render(reduced ? 0 : acc, 1)
    },
    redraw: () => render(reduced ? 0 : acc, 1),
    pause: (next) => {
      if (next === paused) return
      paused = next
      if (paused) stop()
      else {
        last = performance.now()
        schedule()
      }
    },
    hold: (source, index) => {
      held[source] = index
      applyPin()
      // Draw a newly pinned orb where it is held right away.
      if (index !== null && sim.pinned[index]) render(reduced ? 0 : acc, 0)
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
