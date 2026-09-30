import { rgba } from "@/shared/lib/color"
import { PALETTE } from "@/shared/lib/palette"
import type { GateStatus } from "./gate-machine"
import { createRingColorSequence } from "./ring-colors"
import { dimTint, nextRingIndex, ringDepth } from "./tunnel-math"

export interface TunnelOptions {
  /** Read every frame, so a state change never restarts the loop. */
  getGate: () => GateStatus
  /** Seeds the ring colors; by default drawn once per visit so every visit paints its own sequence. */
  seed?: number
}

export interface TunnelRenderer {
  stop: () => void
}

const RAMP = " .:-=+*#%@"
const CW = 10
const CH = 16

// Ring colors: Porcelain, Periwinkle and Sunflower Gold. School Bus Yellow stays out (UI details only).
const RING_PALETTE = [PALETTE.ink, PALETTE.periwinkle, PALETTE.gold] as const
// Each ring color has exactly two levels: full for bright glyphs, and a fixed dim tint for faint ones and wall dots.
const DIM_PALETTE = RING_PALETTE.map(dimTint)
const FULL_FROM = 0.36

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
  // One draw list per (palette color, level), so a frame changes fillStyle at most six times.
  const groups: number[][] = RING_PALETTE.flatMap(() => [[], []] as number[][])
  const rings = createRingColorSequence(options.seed ?? Math.floor(Math.random() * 0x100000000), RING_PALETTE)

  // next/font hashes the family name; the CSS variable carries the real one.
  const family = getComputedStyle(canvas).getPropertyValue("--font-doto").trim() || "Doto"
  const font = `600 15px ${family}, ui-monospace, Menlo, Consolas, monospace`

  function draw(dt: number) {
    if (!alive || !ctx) return
    const gate = options.getGate()
    speed += (targetSpeed(gate) - speed) * (1 - Math.exp(-dt * (gate === "granted" ? 1.4 : 3)))
    phase += speed * dt
    twist += speed * dt * 0.012
    const follow = 1 - Math.exp(-dt * 2.2)
    vx += (0.5 + (pointerX - 0.5) * 0.45 - vx) * follow
    vy += (0.5 + (pointerY - 0.5) * 0.45 - vy) * follow
    const gain = gate === "granted" ? 1 + Math.min(speed / 7, 1) * 0.7 : gate === "denied" ? 0.55 : 1

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = "source-over"
    ctx.fillStyle = PALETTE.void
    ctx.fillRect(0, 0, W, H)

    const cols = Math.ceil(W / CW)
    const rows = Math.ceil(H / CH)
    const cx = vx * W
    const cy = vy * H
    const minSide = Math.min(W, H)
    for (const g of groups) g.length = 0

    for (let j = 0; j < rows; j++) {
      const y = j * CH + CH / 2
      const dy = (y - cy) / minSide
      for (let i = 0; i < cols; i++) {
        const x = i * CW + CW / 2
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
        const fog = Math.min(1, Math.max(0, (r - 0.025) / 0.32))
        let v = ring * gap * (0.2 + 0.8 * fog) * gain
        if (hash(i * 31 + ringIdx * 7, j) > 0.955) v = Math.max(v, 0.14 * fog * gain)
        if (v < 0.07) continue
        const ci = Math.min(RAMP.length - 1, Math.max(1, Math.round(v * (RAMP.length - 1))))
        // Brightness picks the glyph; the ring picks the color, at full or dim level only.
        groups[rings.indexAt(ringIdx) * 2 + (v >= FULL_FROM ? 0 : 1)].push(x, y, ci)
      }
    }

    ctx.font = font
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (let g = 0; g < groups.length; g++) {
      const list = groups[g]
      if (!list.length) continue
      const color = g >> 1
      ctx.fillStyle = g & 1 ? DIM_PALETTE[color] : RING_PALETTE[color]
      for (let k = 0; k < list.length; k += 3) ctx.fillText(RAMP[list[k + 2]], list[k], list[k + 1])
    }

    // The light at the end of the tunnel.
    ctx.globalCompositeOperation = "lighter"
    const glowR = minSide * (0.16 + 0.1 * Math.min(speed / 7, 1))
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR)
    // The glow takes the color of the ring about to be born, so the light foreshadows the next wave.
    const glow = rings.colorAt(nextRingIndex(phase))
    grad.addColorStop(0, rgba(glow, 0.34 * gain))
    grad.addColorStop(1, rgba(glow, 0))
    ctx.fillStyle = grad
    ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2)
    ctx.globalCompositeOperation = "source-over"
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

  // Canvas text does not trigger a font download, and the 600 weight is used nowhere in the DOM.
  if (document.fonts?.load) {
    document.fonts.load(font).then(
      () => {
        if (alive && (reduced || !raf)) draw(0)
      },
      () => {},
    )
  }

  return {
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
