"use client"

import { useEffect, useRef } from "react"

/** How far, in px, the panel scrolls past the headline while it gives way to its compact line. */
export const HEADLINE_RANGE = 160

const REDUCED = "(prefers-reduced-motion: reduce)"

/**
 * How far the headline has given way to its compact line, from 0 (large) to 1 (compact), once its top has risen `rise`
 * px past the line's. Under reduced motion it is only ever one or the other, switching halfway.
 */
export function headlineProgress(rise: number, reduced: boolean): number {
  const p = Math.min(1, Math.max(0, rise / HEADLINE_RANGE))
  return reduced ? (p >= 0.5 ? 1 : 0) : p
}

/**
 * Follows the case study's scrolling panel and writes how far its headline has given way, as `--headline` (0 to 1) and
 * `data-headline` ("large" or "compact") on the panel, at most once a frame. The styles read them (globals.css,
 * .case-headline): nothing here re-renders, and only transforms and opacities change, so nothing reflows. The headline
 * starts giving way when its top reaches the compact line's, wherever the layout set it. Returns the refs to attach:
 * the panel that scrolls, the headline, and its compact line.
 */
export function useHeadlineProgress() {
  const panel = useRef<HTMLDivElement>(null)
  const headline = useRef<HTMLHeadingElement>(null)
  const line = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const root = panel.current
    if (!root) return
    const motion = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED) : null
    const update = () => {
      const head = headline.current
      const mark = line.current
      const rise = head && mark ? mark.getBoundingClientRect().top - head.getBoundingClientRect().top : 0
      const p = headlineProgress(rise, motion?.matches ?? false)
      root.style.setProperty("--headline", String(Math.round(p * 1000) / 1000))
      root.dataset.headline = p >= 1 ? "compact" : "large"
    }
    let pending = false
    let frame = 0
    const schedule = () => {
      if (pending) return
      pending = true
      frame = requestAnimationFrame(() => {
        pending = false
        update()
      })
    }
    update()
    root.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    motion?.addEventListener("change", update)
    return () => {
      cancelAnimationFrame(frame)
      root.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      motion?.removeEventListener("change", update)
    }
  }, [])
  return { panel, headline, line }
}
