"use client"

import { useEffect, useRef } from "react"
import { parallaxOffset } from "./camera"
import type { CameraSource } from "./camera-controller"
import { loopShouldRun } from "./loop-gate"
import {
  DUST_DEPTH,
  DUST_LAYERS,
  DUST_TINTS,
  dustCount,
  dustPositionAt,
  dustReach,
  makeDust,
  spriteCoreStop,
  wrapAround,
  type DustParticle,
} from "./dust-field"

interface DustCanvasProps {
  /** Reduced motion: one still frame, no drift and no pointer parallax. */
  reduced: boolean
  /** Dust tints (CSS colors); three are used. */
  tints?: readonly string[]
  /** The canvas camera: each depth layer follows it a different amount (far dust barely moves), and the field wraps. */
  camera?: CameraSource
  /** Something opaque covers the canvas (the glass view): the loop idles instead of drawing under it. */
  paused?: boolean
}

const SEED = 20261001
const MAX_DPR = 2
const DEFAULT_TINTS = ["#cfe0ff", "#d9ccff", "#bfeaff"]
const PARALLAX_EASE_PER_S = 3

/** A crisp round sprite: a solid core and a short, sharp falloff; `softness` only widens that falloff a little. */
function makeSprite(color: string, softness: number): HTMLCanvasElement {
  const size = 64
  const sprite = document.createElement("canvas")
  sprite.width = sprite.height = size
  const ctx = sprite.getContext("2d")
  if (!ctx) return sprite
  const core = spriteCoreStop(softness)
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, color)
  gradient.addColorStop(core, color)
  gradient.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return sprite
}

/**
 * The void's dust: tiny, crisp, round motes in three depths on one DPR-aware 2D canvas. Positions are a pure function
 * of time, so the field is deterministic. It drifts slowly, leans a little toward the pointer on fine pointers
 * (nearer motes more), pauses when the tab is hidden or the canvas is off screen, and holds still under
 * reduced motion.
 */
export function DustCanvas({ reduced, tints = DEFAULT_TINTS, camera, paused = false }: DustCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const pausedRef = useRef(paused)
  // The running loop's own way to stop and resume, so pausing never rebuilds the canvas.
  const control = useRef<((paused: boolean) => void) | null>(null)
  useEffect(() => {
    pausedRef.current = paused
    control.current?.(paused)
  }, [paused])

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const fine = typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches
    let dust: DustParticle[] = []
    let sprites: HTMLCanvasElement[][] = []
    let cssW = 0
    let cssH = 0
    let raf = 0
    let visible = true
    let started = performance.now()
    let last = started
    const pointer = { x: 0, y: 0 }
    const lean = { x: 0, y: 0 }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(Math.round(rect.width), 1)
      const height = Math.max(Math.round(rect.height), 1)
      if (width === cssW && height === cssH && dust.length > 0) return
      cssW = width
      cssH = height
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      canvas.width = Math.round(cssW * dpr)
      canvas.height = Math.round(cssH * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      dust = makeDust(SEED, dustCount(cssW, cssH))
      if (sprites.length === 0) {
        sprites = DUST_LAYERS.map((layer) =>
          Array.from({ length: DUST_TINTS }, (_, i) => makeSprite(tints[i % tints.length], layer.softness)),
        )
      }
    }

    const draw = (seconds: number) => {
      ctx.clearRect(0, 0, cssW, cssH)
      const cam = camera?.camera()
      const home = camera?.home()
      for (const p of dust) {
        const at = dustPositionAt(p, seconds)
        let x = at.x * cssW + lean.x * p.parallax
        let y = at.y * cssH + lean.y * p.parallax
        if (cam && home) {
          // Depth parallax: a layer follows the camera by its own share, and the field wraps so it never runs out.
          const depth = DUST_DEPTH[p.layer] ?? 0
          const shift = parallaxOffset(cam, home, depth)
          const grow = (cam.zoom / home.zoom) ** depth
          x = wrapAround(cssW / 2 + (x - cssW / 2) * grow + shift.x, cssW)
          y = wrapAround(cssH / 2 + (y - cssH / 2) * grow + shift.y, cssH)
        }
        const reach = dustReach(p)
        ctx.globalAlpha = p.alpha
        ctx.drawImage(sprites[p.layer][p.tint], x - reach, y - reach, reach * 2, reach * 2)
      }
      ctx.globalAlpha = 1
    }

    const frame = (now: number) => {
      raf = 0
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const k = Math.min(1, dt * PARALLAX_EASE_PER_S)
      lean.x += (pointer.x - lean.x) * k
      lean.y += (pointer.y - lean.y) * k
      draw((now - started) / 1000)
      schedule()
    }
    const schedule = () => {
      if (!raf && visible && loopShouldRun({ alive: true, reduced, hidden: document.hidden, paused: pausedRef.current })) raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    control.current = (next) => {
      if (next) stop()
      else {
        last = performance.now()
        schedule()
      }
    }

    const onResize = () => {
      resize()
      draw((performance.now() - started) / 1000)
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else {
        last = performance.now()
        schedule()
      }
    }
    const onPointerMove = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2
    }

    resize()
    started = last = performance.now()
    draw(0)
    if (!reduced) {
      document.addEventListener("visibilitychange", onVisibility)
      if (fine) window.addEventListener("pointermove", onPointerMove, { passive: true })
      schedule()
    }
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : (window.addEventListener("resize", onResize), null)
    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
            if (visible) {
              last = performance.now()
              schedule()
            } else stop()
          })
        : null
    observer?.observe(canvas)
    io?.observe(canvas)
    // The loop redraws every frame; the still field (reduced motion) redraws when the camera moves.
    const unsubscribe = reduced ? camera?.subscribe(() => draw(0)) : undefined

    return () => {
      control.current = null
      stop()
      unsubscribe?.()
      observer?.disconnect()
      io?.disconnect()
      window.removeEventListener("resize", onResize)
      window.removeEventListener("pointermove", onPointerMove)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [reduced, tints, camera])

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />
}
