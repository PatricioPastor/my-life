import { rgba } from "@/shared/lib/color"
import type { GateStatus } from "./gate-machine"
import { blendStep, createBlendCache, smooth } from "./color-blend"
import { createHeartbeat } from "./heartbeat"
import { PORTAL } from "./portal-palette"
import { TANGENT_GLYPHS, gridFor, tangentIndex, type Grid } from "./glyphs"
import { createRingColorSequence } from "./ring-colors"
import { DIM_SHARE, mixHex, ringDepth } from "./tunnel-math"

export interface TunnelOptions {
  /** Read every frame, so a state change never restarts the loop. */
  getGate: () => GateStatus
  /** Seeds the ring colors and the heartbeat; by default drawn once per visit so every visit paints its own. */
  seed?: number
  /** A canvas layered above this one; it gets a half-resolution copy every frame, and its opacity follows the beat. */
  bloom?: HTMLCanvasElement | null
}

export interface TunnelRenderer {
  /** Repaints the current frame; the only way a static (reduced motion) tunnel reacts to a gate change. */
  refresh: () => void
  stop: () => void
}

const RAMP = " .:-=+*#%@"
// Ring spines use the direction glyphs; everything else keeps the brightness ramp.
const CHARS = [...RAMP, ...TANGENT_GLYPHS]
const SPINE_FROM = 0.55
const BLEND_STEPS = 6
const FULL_FROM = 0.36
/** Radius (short-side fraction) where a wave starts and where it leaves the screen. */
const WAVE_FROM = 0.03
const WAVE_TO = 0.9
const BIRTH_RADIUS = 0.03

function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

// The gate's state is the throttle: idle drift, a lurch while checking,
// a stall when refused, a warp when the door opens.
function targetSpeed(gate: GateStatus): number {
  return gate === "granted" ? 7 : gate === "checking" ? 1.6 : gate === "denied" ? 0.16 : gate === "requested" ? 0.35 : 0.55
}

// Extra speed a beat adds at full surge: the tunnel is "expelled" forward on every beat.
function surgeSpeed(gate: GateStatus): number {
  return gate === "granted" ? 2 : gate === "checking" ? 2.6 : gate === "denied" ? 0.5 : gate === "requested" ? 0.9 : 1.6
}

interface Band {
  center: number
  invWidth: number
  gain: number
}

/**
 * An ASCII tunnel racing toward the viewer, drawn on a 2D canvas.
 * `stage` receives the pointer so the vanishing point can lean toward it.
 * Returns null when 2D canvas is unavailable.
 */
export function createTunnelRenderer(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  options: TunnelOptions,
): TunnelRenderer | null {
  const ctx = canvas.getContext("2d", { alpha: false })
  if (!ctx) return null
  const reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)

  let W = 1
  let H = 1
  let dpr = 1
  let pointerX = 0.5
  let pointerY = 0.5
  let vx = 0.5
  let vy = 0.5
  let speed = 0.55
  let phase = 0
  let twist = 0
  let last = performance.now()
  let raf = 0
  let visible = true
  let alive = true

  const seed = options.seed ?? Math.floor(Math.random() * 0x100000000)
  const rings = createRingColorSequence(seed, PORTAL.rings)
  const beat = createHeartbeat(seed ^ 0x5bd1e995)
  const cache = createBlendCache(PORTAL.rings, PORTAL.deep, BLEND_STEPS, DIM_SHARE)
  // One draw list per (ring pair, blend step, level), so a frame changes fillStyle once per non-empty list.
  const groups: number[][] = Array.from({ length: cache.count }, () => [])
  const bands: Band[] = []

  const bloom = options.bloom ?? null
  const bloomCtx = bloom ? bloom.getContext("2d", { alpha: false }) : null
  // next/font hashes the family name; the CSS variable carries the real one.
  const family = getComputedStyle(canvas).getPropertyValue("--font-silkscreen").trim() || "Silkscreen"
  let grid: Grid = gridFor(1, 1)
  let font = ""

  function draw(dt: number) {
    if (!alive || !ctx) return
    const gate = options.getGate()
    // A static tunnel neither beats nor surges.
    const pulse = reduced ? null : beat
    if (pulse) pulse.advance(dt, gate)
    const sample = pulse ? pulse.sample() : null
    const surge = sample ? sample.surge : 0

    speed += (targetSpeed(gate) - speed) * (1 - Math.exp(-dt * (gate === "granted" ? 1.4 : 3)))
    phase += (speed + surge * surgeSpeed(gate)) * dt
    twist += speed * dt * 0.012
    const follow = 1 - Math.exp(-dt * 2.2)
    vx += (0.5 + (pointerX - 0.5) * 0.45 - vx) * follow
    vy += (0.5 + (pointerY - 0.5) * 0.45 - vy) * follow
    const gain = gate === "granted" ? 1 + Math.min(speed / 7, 1) * 0.7 : gate === "denied" ? 0.55 : 1

    bands.length = 0
    if (sample) {
      for (let w = 0; w < sample.waveCount; w++) {
        const wave = sample.waves[w]
        if (wave.fade < 0.01) continue
        const center = WAVE_FROM + (WAVE_TO - WAVE_FROM) * Math.pow(wave.progress, 1.5)
        bands.push({ center, invWidth: 1 / (0.05 + 0.16 * center), gain: wave.fade * wave.strength })
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = "source-over"
    ctx.fillStyle = PORTAL.deep
    ctx.fillRect(0, 0, W, H)

    const { cw, ch } = grid
    const cols = Math.ceil(W / cw)
    const rows = Math.ceil(H / ch)
    const cx = vx * W
    const cy = vy * H
    const minSide = Math.min(W, H)
    for (const g of groups) g.length = 0

    for (let j = 0; j < rows; j++) {
      const y = j * ch + ch / 2
      const dy = (y - cy) / minSide
      for (let i = 0; i < cols; i++) {
        const x = i * cw + cw / 2
        const dx = (x - cx) / minSide
        const r = Math.sqrt(dx * dx + dy * dy) + 1e-4
        // Depth into the tunnel; rings live at whole steps of u and race outward.
        const u = ringDepth(r, phase)
        const ringIdx = Math.floor(u)
        const ph = u - ringIdx
        let ring = ph < 0.22 ? 1 - ph / 0.22 : 0
        ring *= ring
        const ang = Math.atan2(dy, dx) / 6.28318 + 0.5 + twist
        const gap = hash(ringIdx, Math.floor(ang * 40)) < 0.2 ? 0.12 : 1
        // Far (near the vanishing point) fades into the dark, so the tunnel reads as deep.
        const fog = Math.min(1, Math.max(0, (r - 0.025) / 0.34))
        const depth = 0.14 + 0.86 * Math.pow(fog, 1.4)
        let v = ring * gap * depth * gain
        if (hash(i * 31 + ringIdx * 7, j) > 0.955) v = Math.max(v, 0.14 * depth * gain)
        for (const b of bands) {
          const d = (r - b.center) * b.invWidth
          if (d < 2.4 && d > -2.4) v += b.gain * Math.exp(-d * d) * (0.25 + 0.75 * depth) * 0.85
        }
        if (v < 0.07) continue
        // The bright spine of a ring follows its direction; its fading tail and the dots keep the brightness ramp.
        const ci =
          ring * gap >= SPINE_FROM && depth > 0.3
            ? RAMP.length + tangentIndex(dx, dy)
            : Math.min(RAMP.length - 1, Math.max(1, Math.round(v * (RAMP.length - 1))))
        // Brightness picks the glyph and the level; the ring pair and its phase pick a smoothly blended color.
        const key = cache.key(rings.indexAt(ringIdx), rings.indexAt(ringIdx + 1), blendStep(ph, BLEND_STEPS), v >= FULL_FROM ? 0 : 1)
        groups[key].push(x, y, ci)
      }
    }

    ctx.font = font
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (let g = 0; g < groups.length; g++) {
      const list = groups[g]
      if (!list.length) continue
      ctx.fillStyle = cache.colorOf(g)
      for (let k = 0; k < list.length; k += 3) ctx.fillText(CHARS[list[k + 2]], list[k], list[k + 1])
    }

    // Vignette: the edges sink into the dark, which sells the depth.
    const reach = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy))
    const vig = ctx.createRadialGradient(cx, cy, reach * 0.35, cx, cy, reach)
    vig.addColorStop(0, rgba(PORTAL.deep, 0))
    vig.addColorStop(1, rgba(PORTAL.deep, 0.72))
    ctx.fillStyle = vig
    ctx.fillRect(0, 0, W, H)

    // The light at the end of the tunnel, the brightest point. It crossfades from this ring's color to the
    // next as the next ring is born, so it never jumps.
    const u0 = ringDepth(BIRTH_RADIUS, phase)
    const k0 = Math.floor(u0)
    const glow = mixHex(rings.colorAt(k0 + 1), rings.colorAt(k0), smooth(u0 - k0))
    ctx.globalCompositeOperation = "lighter"
    const glowR = minSide * (0.16 + 0.1 * Math.min(speed / 7, 1) + 0.05 * surge)
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR)
    const strength = (0.42 + 0.4 * surge) * gain
    grad.addColorStop(0, rgba(glow, Math.min(strength, 0.95)))
    grad.addColorStop(0.35, rgba(glow, strength * 0.4))
    grad.addColorStop(1, rgba(glow, 0))
    ctx.fillStyle = grad
    ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2)
    ctx.globalCompositeOperation = "source-over"

    // Bloom: one half-resolution copy; CSS blurs it and screen-blends it back over the tunnel.
    if (bloom && bloomCtx) {
      bloomCtx.drawImage(canvas, 0, 0, bloom.width, bloom.height)
      bloom.style.opacity = String(0.35 + 0.5 * surge)
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    W = Math.max(canvas.clientWidth, 1)
    H = Math.max(canvas.clientHeight, 1)
    const w = Math.floor(W * dpr)
    const h = Math.floor(H * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    if (bloom) {
      const bw = Math.max(Math.floor(w / 2), 1)
      const bh = Math.max(Math.floor(h / 2), 1)
      if (bloom.width !== bw || bloom.height !== bh) {
        bloom.width = bw
        bloom.height = bh
      }
    }
    grid = gridFor(W, H)
    font = `${grid.font}px ${family}, ui-monospace, Menlo, Consolas, monospace`
    // Canvas text does not trigger a font download, so ask for it; repaint once it is there.
    if (document.fonts?.load) {
      const wanted = font
      document.fonts.load(wanted).then(
        () => {
          if (alive && font === wanted && (reduced || !raf)) draw(0)
        },
        () => {},
      )
    }
    draw(0)
  }

  function frame(now: number) {
    raf = 0
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1)
    last = now
    draw(dt)
    if (alive && visible && !document.hidden) raf = requestAnimationFrame(frame)
  }

  function wake() {
    if (alive && !reduced && !raf && visible && !document.hidden) {
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
  }

  // The vanishing point leans toward the pointer.
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    pointerX = Math.min(Math.max((e.clientX - r.left) / Math.max(r.width, 1), 0), 1)
    pointerY = Math.min(Math.max((e.clientY - r.top) / Math.max(r.height, 1), 0), 1)
  }

  stage.addEventListener("pointermove", onMove)
  const io =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
          visible = entries.some((en) => en.isIntersecting)
          wake()
        })
      : null
  io?.observe(canvas)
  document.addEventListener("visibilitychange", wake)
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null
  ro?.observe(canvas)

  resize()
  wake()

  return {
    refresh: () => {
      if (alive && (reduced || !raf)) draw(0)
    },
    stop: () => {
      alive = false
      cancelAnimationFrame(raf)
      raf = 0
      ro?.disconnect()
      io?.disconnect()
      document.removeEventListener("visibilitychange", wake)
      stage.removeEventListener("pointermove", onMove)
    },
  }
}
