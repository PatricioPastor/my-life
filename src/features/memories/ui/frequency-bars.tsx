"use client"

import { useEffect, useRef, type CSSProperties } from "react"
import { BAR_COUNT, BAR_REST, barScale, barTargets, stepBars } from "./audio-bars"
import type { AudioGraph } from "./use-audio-level"

interface FrequencyBarsProps {
  /** Where the spectrum is read from (the same analyser that lights the orb). */
  graph: AudioGraph
  /** The voice is playing: the bars follow its spectrum. Otherwise they ease down to a calm baseline. */
  playing: boolean
  /** Under reduced motion the bars do not move: they hold the baseline. */
  reduced: boolean
  className?: string
  style?: CSSProperties
}

/** What one run of the loop keeps between plays, so a pause lets the bars fall instead of snapping to rest. */
interface BarState {
  heights: number[]
  targets: Float32Array
  /** The last `scaleY` written to each bar, so a bar that has not moved is not written again. */
  written: number[]
}

const restStyle = { transform: `scaleY(${BAR_REST})` }

/**
 * A row of bars that dance with the voice, mirrored around the middle. They are driven by one animation loop that
 * writes `transform: scaleY` straight onto the bars (no React state per frame), only while the voice plays and until the
 * bars have settled after it stops, and never while the tab is hidden.
 */
export function FrequencyBars({ graph, playing, reduced, className, style }: FrequencyBarsProps) {
  const root = useRef<HTMLDivElement>(null)
  const state = useRef<BarState | null>(null)

  useEffect(() => {
    const bars = root.current?.children
    if (!bars || reduced) return
    const model = (state.current ??= {
      heights: new Array<number>(BAR_COUNT).fill(0),
      targets: new Float32Array(BAR_COUNT),
      written: new Array<number>(BAR_COUNT).fill(BAR_REST),
    })
    let raf = 0
    let last: number | null = null
    let stopped = false

    const tick = (now: number) => {
      raf = 0
      if (stopped) return
      const dt = last === null ? 16 : now - last
      last = now
      const spectrum = playing ? graph.spectrum() : null
      if (spectrum) barTargets(spectrum, BAR_COUNT, model.targets)
      else model.targets.fill(0)
      const moving = stepBars(model.heights, model.targets, dt)
      for (let i = 0; i < BAR_COUNT; i++) {
        const scale = barScale(model.heights[i])
        // A bar is only written when it has visibly moved; the baseline is always written exactly, so it settles on it.
        const changed = scale === BAR_REST ? model.written[i] !== BAR_REST : Math.abs(scale - model.written[i]) >= 0.004
        if (!changed) continue
        model.written[i] = scale
        ;(bars[i] as HTMLElement).style.transform = `scaleY(${scale.toFixed(3)})`
      }
      if ((playing || moving) && !document.hidden) raf = requestAnimationFrame(tick)
    }
    const onVisibility = () => {
      if (document.hidden || raf) return
      last = null
      raf = requestAnimationFrame(tick)
    }

    document.addEventListener("visibilitychange", onVisibility)
    if (!document.hidden) raf = requestAnimationFrame(tick)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [graph, playing, reduced])

  return (
    <div ref={root} data-glass-bars aria-hidden="true" className={className} style={style}>
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span key={i} data-glass-bar className="mem-glass-bar" style={restStyle} />
      ))}
    </div>
  )
}
