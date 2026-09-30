"use client"

import { useEffect, useRef, type RefObject } from "react"
import { createWheelGate, normalizeWheelDelta } from "./wheel-gate"

/** Finger travel (px) that counts as one swipe. */
export const SWIPE_PX = 56

const NEXT_KEYS = new Set(["ArrowDown", "PageDown", " "])
const PREV_KEYS = new Set(["ArrowUp", "PageUp"])
// A key that belongs to a control (Space on a button, arrows in a field) is never ours.
const OWN_KEYS = "button, a, input, textarea, select, summary, [contenteditable='true']"

/**
 * Wheel, swipe and keys as one-paragraph-per-gesture steps. The surface swallows the page scroll (and its chaining) so the
 * story is moved by the reader only; a trackpad fling counts once (see the wheel gate).
 */
export function useReaderGestures(surface: RefObject<HTMLElement | null>, onStep: (direction: 1 | -1) => void, enabled: boolean) {
  const stepRef = useRef(onStep)
  useEffect(() => {
    stepRef.current = onStep
  })

  useEffect(() => {
    const el = surface.current
    if (!el || !enabled) return
    const gate = createWheelGate()

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return // pinch-zoom, not reading
      e.preventDefault()
      const dy = normalizeWheelDelta(e.deltaY, e.deltaMode, el.clientHeight || window.innerHeight)
      const step = gate.feed(dy, performance.now())
      if (step) stepRef.current(step)
    }

    let startY: number | null = null
    let fired = false
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY ?? null
      fired = false
    }
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const y = e.touches[0]?.clientY
      if (startY === null || y === undefined || fired) return
      const dy = y - startY
      if (Math.abs(dy) < SWIPE_PX) return
      fired = true
      stepRef.current(dy < 0 ? 1 : -1)
    }
    const onTouchEnd = () => {
      startY = null
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target instanceof Element && e.target.closest(OWN_KEYS)) return
      const direction = NEXT_KEYS.has(e.key) ? 1 : PREV_KEYS.has(e.key) ? -1 : 0
      if (direction === 0) return
      e.preventDefault()
      stepRef.current(direction)
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: false })
    el.addEventListener("touchend", onTouchEnd)
    el.addEventListener("touchcancel", onTouchEnd)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", onTouchEnd)
      el.removeEventListener("touchcancel", onTouchEnd)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [surface, enabled])
}
