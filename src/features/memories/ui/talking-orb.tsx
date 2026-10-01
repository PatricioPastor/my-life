"use client"

import { useEffect, useRef, type CSSProperties } from "react"
import { cn } from "@/shared/lib/utils"
import { rimColor } from "../orb-color"
import { laggedLevels, pushLevel, smoothLevel } from "./audio-level"
import { useReducedMotion } from "./use-reduced-motion"

export interface TalkingOrbProps {
  /** `#rrggbb` the orb glows in: the memory's orb color. */
  color: string
  /**
   * Reads the voice level, 0 to 1. Called once per animation frame while `active`; give it the function that
   * `useAudioLevel` returns (or any other source: it is only ever called, never stored in state).
   */
  level: () => number
  /** Whether the voice is on. Off, the orb eases back to its resting glow and the animation loop stops. */
  active: boolean
  /** Diameter of the core in CSS pixels. The ripples reach past it, within the element's box (twice the size). Default 44. */
  size?: number
  /** Forces reduced motion on or off. By default it follows the visitor's `prefers-reduced-motion`. */
  reducedMotion?: boolean
  className?: string
}

type OrbStyle = CSSProperties & Record<`--${string}`, string | number>

/** How often the level is sampled for the ripples, and how far back each ripple reads (milliseconds). */
const SAMPLE_MS = 50
const RIPPLE_LAGS_MS = [140, 300] as const
const HISTORY = 12
/** Below this the orb counts as at rest. */
const REST = 0.008

interface Motion {
  level: number
  history: number[]
  sinceSample: number
}

/**
 * A small orb that talks: it pulses with the loudness of a voice and sends ripples outward. It is decoration (hidden
 * from assistive technology), so whatever plays the voice keeps its own accessible controls.
 *
 * The level is applied straight to CSS variables on the element each frame (`--lvl` for the core, `--r1` and `--r2`
 * for the ripples, which show the level from a moment earlier so the voice seems to travel outward), so a voice at 60 fps
 * costs no React render. Under reduced motion there are no ripples and nothing scales: the core only glows brighter
 * with the level. The loop runs only while the voice is on or the orb is still settling, and is cancelled on unmount.
 * Reusable: it knows nothing about the form (the viewer can use it with the level of the memory's audio).
 */
export function TalkingOrb({ color, level, active, size = 44, reducedMotion, className }: TalkingOrbProps) {
  const preferred = useReducedMotion()
  const reduced = reducedMotion ?? preferred
  const root = useRef<HTMLDivElement>(null)
  const read = useRef(level)
  const on = useRef(active)
  const motion = useRef<Motion>({ level: 0, history: [], sinceSample: 0 })

  // The latest props for the loop, which must not restart every time the parent re-renders.
  useEffect(() => {
    read.current = level
    on.current = active
  })

  useEffect(() => {
    const element = root.current
    if (!element) return
    const state = motion.current

    const write = () => {
      element.style.setProperty("--lvl", state.level.toFixed(3))
      const [first, second] = laggedLevels(state.history, SAMPLE_MS, RIPPLE_LAGS_MS)
      element.style.setProperty("--r1", (first ?? 0).toFixed(3))
      element.style.setProperty("--r2", (second ?? 0).toFixed(3))
    }
    const settled = () => state.level < REST && state.history.every((value) => value < REST)

    if (!active && settled()) {
      state.level = 0
      state.history = []
      write()
      return
    }

    let frame = 0
    let last: number | null = null
    const step = (now: number) => {
      const dt = last === null ? 0 : now - last
      last = now
      state.level = smoothLevel(state.level, on.current ? read.current() : 0, dt)
      state.sinceSample += dt
      if (state.sinceSample >= SAMPLE_MS) {
        state.sinceSample = 0
        state.history = pushLevel(state.history, state.level, HISTORY)
      }
      write()
      if (on.current || !settled()) frame = requestAnimationFrame(step)
      else {
        state.level = 0
        state.history = []
        write()
      }
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [active, reduced])

  const style: OrbStyle = {
    width: size * 2,
    height: size * 2,
    "--pc": color,
    "--rim": rimColor(color),
    "--lvl": 0,
    "--r1": 0,
    "--r2": 0,
  }

  return (
    <div
      ref={root}
      data-testid="talking-orb"
      data-active={active}
      data-reduced={reduced}
      aria-hidden="true"
      className={cn("pointer-events-none relative grid shrink-0 place-items-center", className)}
      style={style}
    >
      {!reduced &&
        [1, 2].map((n) => (
          <span
            key={n}
            data-ripple
            style={{
              gridArea: "1 / 1",
              width: size,
              height: size,
              borderRadius: "50%",
              border: "1px solid color-mix(in oklab, var(--pc) 75%, white)",
              opacity: `calc(var(--r${n}) * 0.7)`,
              transform: `scale(calc(1 + var(--r${n}) * 0.95))`,
            }}
          />
        ))}
      <span
        data-core
        style={{
          gridArea: "1 / 1",
          width: size,
          height: size,
          borderRadius: "50%",
          background: [
            "radial-gradient(circle,",
            "color-mix(in oklab, var(--pc) 22%, white) 0%,",
            "color-mix(in oklab, var(--pc) 70%, white) 22%,",
            "color-mix(in oklab, var(--pc) 70%, transparent) 55%,",
            "transparent 78%)",
          ].join(" "),
          boxShadow: [
            `0 0 calc(${size}px * (0.5 + var(--lvl) * 0.9)) calc(${size}px * 0.06) color-mix(in oklab, var(--pc) calc(30% + var(--lvl) * 45%), transparent)`,
            `calc(${size}px * -0.14) 0 calc(${size}px * 0.4) color-mix(in oklab, var(--rim) 50%, transparent)`,
          ].join(", "),
          // Pulses with the level; under reduced motion it only brightens (no scaling, no deformation).
          transform: reduced ? undefined : "scale(calc(1 + var(--lvl) * 0.22))",
          filter: reduced ? "brightness(calc(0.85 + var(--lvl) * 0.5))" : undefined,
        }}
      />
    </div>
  )
}
