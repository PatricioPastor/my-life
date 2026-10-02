"use client"

import { useEffect, useRef } from "react"
import type { LensGeometry } from "./glass-layout"
import { hexToUnit } from "./glass-mode"
import { createParticles, particleAlpha, stepParticles, type Particles } from "./orb-particles"

interface ParticleCanvasProps {
  geometry: Pick<LensGeometry, "dpr" | "diameter" | "center">
  /** The memory's orb color (`#rrggbb`): the particles glow in it. */
  color: string
  /** The smoothed voice level, 0..1, read every frame (no React state per frame). */
  level: () => number
  /** The voice is playing: only then are new particles born. The ones in flight always finish. */
  emitting: boolean
  /** The glass is open. Closed, the canvas is cleared and the loop stops. */
  active: boolean
  /** Under reduced motion there are no particles at all. */
  reduced: boolean
}

/** The canvas is this many diameters wide: room for the particles to travel well past the rim without being clipped. */
const SPREAD = 2.6
/** The canvas draws at the screen's density up to this: a soft speck gains nothing from more. */
const MAX_DPR = 2
/** The brightest a particle gets. */
const PEAK_ALPHA = 0.85

/**
 * The particles an audio orb throws off around the sphere: more of them, and faster, the louder the voice. A canvas
 * larger than the sphere (so nothing the sphere clips), drawn behind it, in the memory's color. One loop, with a fixed
 * pool of particles (nothing allocated per frame), that runs only while the voice plays or particles are still in
 * flight, and never while the tab is hidden. Not rendered at all under reduced motion.
 */
export function ParticleCanvas({ geometry, color, level, emitting, active, reduced }: ParticleCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const pool = useRef<Particles | null>(null)
  const { diameter, center } = geometry
  const dpr = Math.min(Math.max(geometry.dpr, 1), MAX_DPR)
  const size = Math.round(diameter * SPREAD)
  const device = Math.round(size * dpr)

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext("2d")
    if (!el || !ctx || reduced) return
    const particles = (pool.current ??= createParticles())
    const [r, g, b] = hexToUnit(color).map((channel) => Math.round(channel * 255))
    const half = size / 2
    let raf = 0
    let last: number | null = null
    let stopped = false

    const clear = () => {
      ctx.setTransform(dpr, 0, 0, dpr, half * dpr, half * dpr)
      ctx.clearRect(-half, -half, size, size)
    }
    if (!active) {
      particles.count = 0
      particles.carry = 0
      clear()
      return
    }

    const tick = (now: number) => {
      raf = 0
      if (stopped) return
      const dt = last === null ? 16 : now - last
      last = now
      stepParticles(particles, dt, { level: level(), emitting, diameter })
      clear()
      if (particles.count > 0) {
        ctx.globalCompositeOperation = "lighter"
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
        for (let i = 0; i < particles.count; i++) {
          const alpha = particleAlpha(particles.age[i], particles.life[i]) * PEAK_ALPHA
          if (alpha < 0.02) continue
          ctx.globalAlpha = alpha
          ctx.beginPath()
          ctx.arc(particles.x[i], particles.y[i], particles.size[i], 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }
      // Idle (not playing, none in flight): the loop ends here, and starts again when the voice does.
      if ((emitting || particles.count > 0) && !document.hidden) raf = requestAnimationFrame(tick)
    }
    const onVisibility = () => {
      if (document.hidden || raf || (!emitting && particles.count === 0)) return
      last = null
      raf = requestAnimationFrame(tick)
    }

    document.addEventListener("visibilitychange", onVisibility)
    if (!document.hidden && (emitting || particles.count > 0)) raf = requestAnimationFrame(tick)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [active, color, diameter, dpr, emitting, level, reduced, size])

  if (reduced) return null
  return (
    <canvas
      ref={canvas}
      data-orb-particles
      aria-hidden="true"
      width={device}
      height={device}
      className="pointer-events-none absolute"
      style={{ left: center.x - size / 2, top: center.y - size / 2, width: size, height: size }}
    />
  )
}
