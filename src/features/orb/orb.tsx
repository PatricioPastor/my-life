"use client"

import { useEffect, useRef, type RefObject } from "react"
import { createOrbMotion, type OrbFrame, type OrbMotion } from "./orb-motion"
import type { Point, Rect } from "./orb-path"
import { isSummonKeyEvent, summonBlocked } from "./orb-summon"

/** The cursor id the journey reads to know the orb is captured. */
export const ORB_CURSOR_ID = "memory-orb"
const LABEL = "Agregar recuerdo"
const CONTEXT = "Deja un recuerdo en este universo. Pulsa R para llamarlo."
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
  /** 0 floating as a glow, 1 fully grown into the window onto the memories dimension. */
  peek: number
  /** The lens sphere's radius in CSS px. */
  lens: number
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
  /** The magnetic cursor has captured it: it eases to a stop so it is easy to click, and it peeks. */
  held: boolean
  /** A trip is under way: it waits where it is, without peeking. */
  parked?: boolean
  sky: RefObject<OrbSky | null>
  /** The boxes it must float clear of, for a viewport of this size. Keep it referentially stable. */
  keepOut: (width: number, height: number) => readonly Rect[]
  /** Called with where the orb was (0..1 stage fractions, y up, like the facet stars). */
  onOpen: (at: { x: number; y: number }) => void
  /** Draws a plain CSS glow in the button, for a sky that has no WebGL to paint one. */
  fallbackGlow?: boolean
  /** The visitor pressed R and the orb is on its way to the cursor: once per summon. */
  onSummon?: () => void
}

function place(mover: HTMLElement, frame: OrbFrame) {
  mover.style.transform = `translate3d(${frame.x.toFixed(2)}px, ${frame.y.toFixed(2)}px, 0)`
  mover.style.setProperty("--orb", frame.hex)
  // The button is the lens at rest and grows with it, so the cursor's frame hugs the window.
  mover.style.setProperty("--orb-d", `${((2 * frame.lens) / frame.zoom).toFixed(1)}px`)
  mover.style.setProperty("--orb-zoom", frame.zoom.toFixed(3))
}

/**
 * The memory orb: a color-shifting glow that wanders the whole sky, with a real button riding on it.
 * The sky paints the glow (so it shares the halftone texture); this owns the motion and the hit target.
 */
export function Orb({
  active,
  interactive,
  held,
  parked = false,
  sky,
  keepOut,
  onOpen,
  fallbackGlow = false,
  onSummon,
}: OrbProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const moverRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<OrbFrame | null>(null)
  const sizeRef = useRef({ width: 1, height: 1 })
  const touchRef = useRef({ hover: false, focus: false })
  const wakeRef = useRef<(() => void) | null>(null)
  const motionRef = useRef<OrbMotion | null>(null)
  // The cursor in the orb's own coordinates; null until it has moved (a touch-only visitor never has one).
  const pointerRef = useRef<Point | null>(null)
  const live = useRef({ active, held, parked, keepOut, interactive, onSummon })

  useEffect(() => {
    live.current = { active, held, parked, keepOut, interactive, onSummon }
    wakeRef.current?.()
  })

  // Leaving the sky (a facet, the portal) drops a summon where the orb is, so it is never stale when it returns.
  useEffect(() => {
    if (!interactive) motionRef.current?.cancelSummon()
  }, [interactive])

  // The button is removed while the portal opens, with no mouseleave or blur to say the pointer or focus left it;
  // forget them, or a stale hover would keep the orb stopped and peeking when it comes back.
  useEffect(() => {
    if (!interactive) touchRef.current = { hover: false, focus: false }
  }, [interactive])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    const motion: OrbMotion = createOrbMotion({ seed: ORB_SEED, reduced })
    motionRef.current = motion
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
      const { active: on, held: isHeld, parked: isParked } = live.current
      const touch = touchRef.current
      const frame = motion.step(dt, {
        held: isHeld || touch.hover || touch.focus,
        active: on,
        parked: isParked,
        pointer: pointerRef.current,
      })
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
          peek: frame.peek,
          lens: frame.lens,
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
    const onPointerMove = (e: PointerEvent | MouseEvent) => {
      const box = root.getBoundingClientRect()
      pointerRef.current = { x: e.clientX - box.left, y: e.clientY - box.top }
    }
    // R calls the orb to the cursor, on the sky only and never while typing or with a dialog open.
    const onKeyDown = (e: KeyboardEvent) => {
      const { active: on, interactive: onSky, onSummon: report } = live.current
      if (!on || !onSky || e.defaultPrevented || !isSummonKeyEvent(e) || summonBlocked(document)) return
      motion.summon()
      wake()
      report?.()
    }
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("keydown", onKeyDown)
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    ro?.observe(root)

    return () => {
      alive = false
      wakeRef.current = null
      motionRef.current = null
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("keydown", onKeyDown)
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
            className="press pointer-events-auto absolute top-0 left-0 rounded-full text-ink"
            style={{
              width: "var(--orb-d, 56px)",
              height: "var(--orb-d, 56px)",
              translate: "-50% -50%",
              scale: "var(--orb-zoom, 1)",
              ...(fallbackGlow
                ? { background: "radial-gradient(closest-side, color-mix(in srgb, var(--orb) 55%, transparent), transparent)" }
                : null),
            }}
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
