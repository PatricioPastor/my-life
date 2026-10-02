import type { MemoryView } from "../memory-view"
import { approachSizes, bestDecoded, ladderOf, type PhotoSize } from "../photo-ladder"
import { glassEase } from "./glass-config"
import { glassMotion, hexToUnit } from "./glass-mode"
import { createGlassRenderer, srgbToLinear, type GlassOptions, type GlassRenderer, type LensSlot } from "./glass-renderer"
import type { GlassSource, PhotoCache } from "./photo-cache"

/** The glass condenses out of the flat orb over this long (a strong ease-out: most of it in the first third). */
export const GLASS_OPEN_MS = 420
/** It melts back into the orb faster: the camera waits for it before flying home. */
export const GLASS_RELEASE_MS = 200
/** The dissolve between two contents chases its target with this time constant (seconds). */
const MIX_TAU_S = 0.09
const MIX_DONE = 0.995
/** Uploaded photos kept on the GPU (the ones on screen are never let go). */
const MAX_TEXTURES = 6

export interface GlassRamp {
  from: number
  to: number
  start: number
}

/** How much glass there is at `now` on a ramp: the open eases out over {@link GLASS_OPEN_MS}, the release faster. */
export function glassAt(ramp: GlassRamp, now: number, reduced: boolean): number {
  // Reduced motion: no warping in, the canvas crossfades over the orb instead (CSS).
  if (reduced) return ramp.to
  const duration = ramp.to > ramp.from ? GLASS_OPEN_MS : GLASS_RELEASE_MS
  const u = (now - ramp.start) / duration
  if (u >= 1) return ramp.to
  if (!(u > 0)) return ramp.from
  return ramp.from + (ramp.to - ramp.from) * glassEase(u)
}

/** One step of a value easing toward a target with time constant `tau`: the same path at any frame rate. */
export function chase(value: number, target: number, dt: number, tau: number): number {
  return target + (value - target) * Math.exp(-Math.max(dt, 0) / tau)
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * How far the dissolve to the next memory should be: nothing until its photo is ready, then in step with the camera
 * carrying the world across (`travel` 0..1), done by 60% of the way; all of it once landed (`travel` null). Under
 * reduced motion there is no travel: a plain crossfade.
 */
export function switchMixTarget(travel: number | null, ready: boolean, reduced: boolean): number {
  if (!ready) return 0
  if (reduced || travel === null) return 1
  return smoothstep(0.15, 0.6, travel)
}

interface Content extends LensSlot {
  key: string
  /** The memory it shows, or a blend of two. */
  id: string
  size: number
  /** A blend texture the lens made itself, released when it is replaced. */
  owned: boolean
}

export interface LensInput {
  /** The voice level, 0..1. */
  level: number
  reduced: boolean
  /** How far the camera has carried the world on a switch, 0..1, or null when it is not moving. */
  travel: number | null
}

export interface LensGeometryInput {
  /** The canvas backing store, square, in device px. */
  device: number
  /** The sphere inside it, in device px. */
  deviceDiameter: number
  /** The sphere in CSS px, and the density it is drawn at (to pick photo sizes). */
  diameter: number
  dpr: number
}

export interface Lens {
  /** The one canvas the glass is drawn on, kept for the life of the space: the glass view adopts it while open. */
  readonly canvas: HTMLCanvasElement
  /** Builds the renderer once (compiles in idle time, never on the frame the glass opens). False without WebGL2. */
  prepare: () => boolean
  available: () => boolean
  /** Called if the GL context is lost: the view falls back to the CSS glass. */
  onFail: (listener: () => void) => () => void
  resize: (geometry: LensGeometryInput) => void
  /** Puts the canvas in a holder the sphere's size: `offset` px out on every side, `size` px square. */
  attach: (holder: HTMLElement, placement: { offset: number; size: number }) => void
  /** Takes the canvas out of its holder. */
  detach: () => void
  /** The memory to hold. The first appears at once (on the best photo it has); another dissolves in. */
  show: (memory: MemoryView) => void
  /** Forgets what it showed and clears the canvas (the glass has closed). */
  reset: () => void
  open: (now: number) => void
  release: (now: number) => void
  /** Draws one frame. Returns the voice glow and how much glass there is, for the CSS halo. */
  frame: (now: number, input: LensInput) => { glow: number; glass: number }
  dispose: () => void
}

interface LensOptions {
  cache: PhotoCache
  createRenderer?: (canvas: HTMLCanvasElement, options: GlassOptions) => GlassRenderer | null
  /** Runs a task off the frame (uploads): a macrotask by default. */
  schedule?: (task: () => void) => void
  canvas?: HTMLCanvasElement
}

const linearTint = (hex: string): [number, number, number] => {
  const [r, g, b] = hexToUnit(hex)
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]
}

const defaultSchedule = (task: () => void) => {
  setTimeout(task, 0)
}

/**
 * The glass sphere's renderer and everything it holds, kept for the life of the memories space. Photos reach it as
 * decoded bitmaps and are uploaded in tasks of their own (never on a frame); the open glass shows the best photo it
 * has and fades sharper ones in; a step to another memory dissolves in step with the camera; a retarget mid-dissolve
 * blends what is on screen into one texture first, so nothing ever jumps.
 */
export function createLens({ cache, createRenderer = createGlassRenderer, schedule = defaultSchedule, canvas: given }: LensOptions): Lens {
  const canvas = given ?? document.createElement("canvas")
  let renderer: GlassRenderer | null = null
  let failed = false
  let disposed = false
  const failListeners = new Set<() => void>()
  let geometry: LensGeometryInput | null = null

  const uploaded = new Map<string, { texture: WebGLTexture; size: number }>()
  const requested = new Set<string>()
  let target: MemoryView | null = null
  let a: Content | null = null
  let b: Content | null = null
  let mix = 0
  let ramp: GlassRamp = { from: 0, to: 0, start: 0 }
  let rampWaits = false
  let lastNow: number | null = null
  let blends = 0
  let drawn = ""

  const diameter = () => geometry?.diameter ?? 400
  const dpr = () => geometry?.dpr ?? 1

  const evict = () => {
    for (const [url, entry] of uploaded) {
      if (uploaded.size <= MAX_TEXTURES) return
      if (a?.texture === entry.texture || b?.texture === entry.texture) continue
      renderer?.release(entry.texture)
      uploaded.delete(url)
      requested.delete(url)
    }
  }

  const upload = (url: string, source: GlassSource, size: number) => {
    if (disposed || !renderer || uploaded.has(url)) return
    const texture = renderer.texture(source)
    if (!texture) return
    uploaded.set(url, { texture, size })
    evict()
  }

  const request = (size: PhotoSize) => {
    if (requested.has(size.url)) return
    requested.add(size.url)
    cache.bitmap(size.url).then(
      (source) => schedule(() => upload(size.url, source, size.width)),
      () => requested.delete(size.url),
    )
  }

  /** What the lens wants on screen for a memory now: its best uploaded photo, its voice light, or nothing yet. */
  const desired = (memory: MemoryView): Content | null => {
    const tint = linearTint(memory.orbColor)
    const ladder = ladderOf(memory)
    if (ladder.length === 0) {
      return { key: `voice:${memory.id}`, id: memory.id, texture: null, size: 0, light: tint, lightWeight: 1, tint, owned: false }
    }
    const best = bestDecoded(ladder, (url) => uploaded.has(url), diameter(), dpr())
    const entry = best ? uploaded.get(best.url) : undefined
    if (!best || !entry) return null
    return { key: `${memory.id}|${best.url}`, id: memory.id, texture: entry.texture, size: entry.size, light: [0, 0, 0], lightWeight: 0, tint, owned: false }
  }

  /** Blends the two contents on screen into one, at the current dissolve, so a new one can start from it. */
  const blend = (from: Content, to: Content, m: number): Content => {
    const size = Math.min(Math.max(from.size, to.size, 1), 2048)
    const texture = from.texture || to.texture ? (renderer?.collapse(from, to, m, size) ?? null) : null
    const weight = (1 - m) * from.lightWeight + m * to.lightWeight
    const color = [0, 1, 2].map((i) => (1 - m) * from.light[i] * from.lightWeight + m * to.light[i] * to.lightWeight)
    const light = (weight > 0 ? color.map((c) => c / weight) : [0, 0, 0]) as [number, number, number]
    const tint = [0, 1, 2].map((i) => (1 - m) * from.tint[i] + m * to.tint[i]) as [number, number, number]
    blends++
    return { key: `blend:${blends}`, id: `blend:${blends}`, texture, size, light, lightWeight: weight, tint, owned: texture !== null }
  }

  const drop = (content: Content | null) => {
    if (content?.owned) renderer?.release(content.texture)
  }

  return {
    canvas,
    prepare: () => {
      // A space that was let go (StrictMode, a remount) prepares again on the same canvas and context.
      disposed = false
      if (renderer || failed) return renderer !== null
      renderer = createRenderer(canvas, {
        onLost: () => {
          failed = true
          renderer = null
          for (const listener of [...failListeners]) listener()
        },
      })
      if (!renderer) failed = true
      else if (geometry) renderer.resize(geometry.device, geometry.deviceDiameter)
      return renderer !== null
    },
    available: () => renderer !== null && !failed,
    onFail: (listener) => {
      failListeners.add(listener)
      return () => failListeners.delete(listener)
    },
    resize: (next) => {
      geometry = next
      renderer?.resize(next.device, next.deviceDiameter)
      if (target) for (const size of approachSizes(ladderOf(target), next.diameter, next.dpr)) request(size)
    },
    attach: (holder, { offset, size }) => {
      canvas.setAttribute("aria-hidden", "true")
      canvas.className = "mem-lens-canvas"
      Object.assign(canvas.style, {
        position: "absolute",
        left: `${-offset}px`,
        top: `${-offset}px`,
        width: `${size}px`,
        height: `${size}px`,
      })
      holder.appendChild(canvas)
    },
    detach: () => canvas.remove(),
    show: (memory) => {
      target = memory
      const ladder = ladderOf(memory)
      const now = bestDecoded(ladder, cache.isDecoded, diameter(), dpr())
      if (now) request(now)
      for (const size of approachSizes(ladder, diameter(), dpr())) request(size)
    },
    reset: () => {
      drop(a)
      drop(b)
      a = null
      b = null
      mix = 0
      target = null
      lastNow = null
      drawn = ""
      ramp = { from: 0, to: 0, start: 0 }
      rampWaits = false
      renderer?.clear()
    },
    open: (now) => {
      ramp = { from: glassAt(ramp, now, false), to: 1, start: now }
      // With nothing to show yet, the ramp starts when the first photo lands, so it never pops in half way.
      rampWaits = a === null
    },
    release: (now) => {
      ramp = { from: glassAt(ramp, now, false), to: 0, start: now }
      rampWaits = false
    },
    frame: (now, input) => {
      const dt = lastNow === null ? 0 : (now - lastNow) / 1000
      lastNow = now
      const motion = glassMotion(input.level, input.reduced)
      if (!renderer) return { glow: motion.glow, glass: 0 }

      const want = target ? desired(target) : null
      if (want) {
        if (!a) {
          a = want
          if (rampWaits) {
            ramp = { ...ramp, start: now }
            rampWaits = false
          }
        } else if (want.key !== a.key && want.key !== b?.key) {
          if (b) {
            // A new target mid-dissolve: what is on screen becomes the starting point.
            const blended = mix > 0.001 ? blend(a, b, mix) : a
            if (blended !== a) drop(a)
            drop(b)
            a = blended
          }
          b = want
          mix = 0
        }
      }

      if (a && b) {
        const target = b.id === a.id ? 1 : switchMixTarget(input.travel, true, input.reduced)
        mix = chase(mix, target, dt, MIX_TAU_S)
        if (mix >= MIX_DONE && target === 1) {
          drop(a)
          a = b
          b = null
          mix = 0
        }
      }

      const glass = glassAt(ramp, rampWaits ? ramp.start : now, input.reduced)
      if (!a) return { glow: motion.glow, glass }
      const time = input.reduced ? 0 : now / 1000
      // Under reduced motion nothing moves by itself: draw only when something changed.
      const state = `${a.key}|${b?.key}|${mix.toFixed(3)}|${glass.toFixed(3)}|${motion.glow.toFixed(3)}`
      if (!input.reduced || state !== drawn) {
        // Fog only when it changes memory; a sharper size of the same photo just comes into focus.
        const fog = b && b.id !== a.id ? 1 : 0
        renderer.draw(a, b, { time, warp: motion.warp, glow: motion.glow, glass, mix, fog })
        drawn = state
      }
      return { glow: motion.glow, glass }
    },
    dispose: () => {
      disposed = true
      drop(a)
      drop(b)
      for (const entry of uploaded.values()) renderer?.release(entry.texture)
      uploaded.clear()
      requested.clear()
      a = null
      b = null
      mix = 0
      renderer?.dispose()
      renderer = null
    },
  }
}
