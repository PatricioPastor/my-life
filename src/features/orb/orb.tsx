"use client"

import { useEffect, useRef, type RefObject } from "react"
import { createOrbMotion, type OrbFrame, type OrbMotion } from "./orb-motion"
import type { Rect } from "./orb-path"

/** The cursor id the journey reads to know the orb is captured. */
export const ORB_CURSOR_ID = "memory-orb"
const LABEL = "Agregar recuerdo"
const CONTEXT = "Deja un recuerdo en este universo."
const DESCRIPTION_ID = "memory-orb-description"

// Every visit paints the same wander. Fixed, so a path that is checked once is checked for good.
const ORB_SEED = 2026
// How far apart the red and blue falloffs of the glow sit, as a share of its radius.
const FRINGE = 0.06
// Under reduced motion the sky has no frame loop, so the orb repaints it on this slow clock instead. A slow
// device (software GL) is given breathing room: the wait is never less than a few times what the last repaint cost.
const REDUCED_TICK_MS = 250
const REDUCED_IDLE_SHARE = 4

/** The glow as the sky paints it (CSS px from the top-left, y down). */
export interface OrbGlow {
  x: number
  y: number
  radius: number
  energy: number
  color: readonly [number, number, number]
  fringe: number
}

/** The slice of the sky the orb talks to; the halftone sky's handle satisfies it. */
export interface OrbSky {
  orb: (glow: OrbGlow | null) => void
  pulse?: (x: number, y: number) => void
  aim?: (x: number, y: number) => void
}

export interface OrbProps {
  /** Lit and moving. When it turns false the orb fades out, then its loop stops. */
  active: boolean
  /** Whether the real button exists. Off while the portal opens, so nothing can be pressed twice. */
  interactive: boolean
  /** The magnetic cursor has captured it: it eases to a stop so it is easy to click. */
  held: boolean
  sky: RefObject<OrbSky | null>
  /** The boxes it must float clear of, for a viewport of this size. Keep it referentially stable. */
  keepOut: (width: number, height: number) => readonly Rect[]
  /** Called with where the orb was (0..1 stage fractions, y up, like the facet stars). */
  onOpen: (at: { x: number; y: number }) => void
  /** Draws a plain CSS glow in the button, for a sky that has no WebGL to paint one. */
  fallbackGlow?: boolean
}

function place(mover: HTMLElement, frame: OrbFrame) {
  mover.style.transform = `translate3d(${frame.x.toFixed(2)}px, ${frame.y.toFixed(2)}px, 0)`
  mover.style.setProperty("--orb", frame.hex)
}

/**
 * The memory orb: a color-shifting glow that wanders the whole sky, with a real button riding on it.
 * The sky paints the glow (so it shares the halftone texture); this owns the motion and the hit target.
 */
export function Orb({ active, interactive, held, sky, keepOut, onOpen, fallbackGlow = false }: OrbProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const moverRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<OrbFrame | null>(null)
  const sizeRef = useRef({ width: 1, height: 1 })
  const touchRef = useRef({ hover: false, focus: false })
  const wakeRef = useRef<(() => void) | null>(null)
  const live = useRef({ active, held, keepOut })

  useEffect(() => {
    live.current = { active, held, keepOut }
    wakeRef.current?.()
  })

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    const motion: OrbMotion = createOrbMotion({ seed: ORB_SEED, reduced })
    let raf = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = performance.now()
    let running = false
    let tookMs = 0
    let shown = false
    let alive = true

    const measure = () => {
      const width = root.clientWidth || window.innerWidth
      const height = root.clientHeight || window.innerHeight
      sizeRef.current = { width, height }
      motion.setViewport(width, height, live.current.keepOut(width, height))
    }

    const tick = () => {
      raf = 0
      timer = undefined
      if (!alive) return
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      const startedAt = now
      const { active: on, held: isHeld } = live.current
      const touch = touchRef.current
      const frame = motion.step(dt, { held: isHeld || touch.hover || touch.focus, active: on })
      frameRef.current = frame
      if (moverRef.current) place(moverRef.current, frame)
      if (frame.energy > 0) {
        shown = true
        sky.current?.orb({
          x: frame.x,
          y: frame.y,
          radius: frame.radius,
          energy: frame.energy,
          color: frame.rgb,
          fringe: FRINGE,
        })
      } else if (shown) {
        shown = false
        sky.current?.orb(null)
      }
      tookMs = performance.now() - startedAt
      // Once it has faded out with nothing asking for it, the loop rests until it is wanted again.
      if (!on && frame.energy <= 0) {
        running = false
        return
      }
      schedule()
    }

    function schedule() {
      // The wait is a timer, but the repaint itself rides a frame, so a busy compositor holds it back.
      if (reduced) {
        timer = setTimeout(() => {
          raf = requestAnimationFrame(tick)
        }, Math.max(REDUCED_TICK_MS, tookMs * REDUCED_IDLE_SHARE))
      } else {
        raf = requestAnimationFrame(tick)
      }
    }

    const wake = () => {
      if (!alive || running || !live.current.active) return
      running = true
      last = performance.now()
      schedule()
    }
    wakeRef.current = wake

    measure()
    wake()
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    ro?.observe(root)

    return () => {
      alive = false
      wakeRef.current = null
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      ro?.disconnect()
      // The ref holds the sky's stable imperative handle, not a node React may swap, so reading it now is right.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      sky.current?.orb(null)
    }
  }, [sky])

  const open = () => {
    const frame = frameRef.current
    const { width, height } = sizeRef.current
    const at = frame ? { x: frame.x / width, y: 1 - frame.y / height } : { x: 0.5, y: 0.5 }
    sky.current?.pulse?.(at.x, at.y)
    onOpen(at)
  }

  const aimAtOrb = () => {
    const frame = frameRef.current
    const { width, height } = sizeRef.current
    if (frame) sky.current?.aim?.(frame.x / width, 1 - frame.y / height)
  }

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0">
      {interactive && (
        <div
          ref={(el) => {
            moverRef.current = el
            if (el && frameRef.current) place(el, frameRef.current)
          }}
          className="absolute top-0 left-0"
        >
          <button
            type="button"
            aria-label={LABEL}
            aria-describedby={DESCRIPTION_ID}
            data-magnetic="strong"
            data-cursor-id={ORB_CURSOR_ID}
            data-cursor-label={LABEL}
            data-cursor-context={CONTEXT}
            className="press pointer-events-auto absolute -mt-7 -ml-7 size-14 rounded-full text-ink"
            style={
              fallbackGlow
                ? { background: "radial-gradient(closest-side, color-mix(in srgb, var(--orb) 55%, transparent), transparent)" }
                : undefined
            }
            onClick={open}
            onMouseEnter={() => {
              touchRef.current.hover = true
            }}
            onMouseLeave={() => {
              touchRef.current.hover = false
            }}
            onFocus={() => {
              touchRef.current.focus = true
              aimAtOrb()
            }}
            onBlur={() => {
              touchRef.current.focus = false
            }}
          />
          {/* Outside the button, so it describes it without becoming part of its name. */}
          <span id={DESCRIPTION_ID} className="sr-only">
            {CONTEXT}
          </span>
        </div>
      )}
    </div>
  )
}
