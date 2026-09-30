"use client"

import { useEffect, useLayoutEffect, useReducer, useRef, useSyncExternalStore } from "react"
import { contextReducer, initialContextState, nextDeadline } from "./context-machine"
import { scrambleFrames } from "./scramble-text"
import type { CursorTarget } from "./magnetic-cursor"

export const HINT_TEXT = "Mantén Ctrl para saber más"
const HINT_MS = 600
const DECODE_MS = 800
const STEP_MS = 40
// Timers can fire a hair early; this keeps a tick from landing just before its deadline.
const TIMER_SLACK_MS = 4

const REDUCED = "(prefers-reduced-motion: reduce)"
function subscribeReduced(notify: () => void) {
  const mq = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED) : null
  mq?.addEventListener("change", notify)
  return () => mq?.removeEventListener("change", notify)
}
const reducedSnapshot = () => typeof window.matchMedia === "function" && window.matchMedia(REDUCED).matches

/**
 * Decodes `text` with zero layout shift: the final text sizes the box (hidden, laid out), and the
 * scramble frames are painted in an absolutely positioned, clipped overlay of the same box.
 * Frames come from the pure `scrambleFrames`; the last one is always the exact text.
 */
function ScrambleText({ text, run, durationMs, reduced }: { text: string; run: boolean; durationMs: number; reduced: boolean }) {
  const overlay = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = overlay.current
    if (!el) return
    if (!run || reduced) {
      el.textContent = text
      return
    }
    const frames = scrambleFrames(text, { durationMs, stepMs: STEP_MS, seed: (Math.random() * 0x7fffffff) | 0 })
    const last = frames.length - 1
    const start = performance.now()
    let raf = 0
    let shown = 0
    el.textContent = frames[0]
    const step = (now: number) => {
      const i = Math.min(last, Math.floor((now - start) / STEP_MS))
      if (i !== shown) {
        shown = i
        el.textContent = frames[i]
      }
      if (i < last) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [text, run, durationMs, reduced])
  return (
    <span className="cp-scramble">
      <span className="cp-final">{text}</span>
      <span ref={overlay} aria-hidden="true" className="cp-overlay" />
    </span>
  )
}

interface ContextPanelProps {
  /** The star the cursor has captured, or null. Only targets with a description are used. */
  target: CursorTarget | null
}

/** Bottom-right: a decoding hint after a dwell on a star, and its description while Ctrl is held. */
export function ContextPanel({ target }: ContextPanelProps) {
  const [state, dispatch] = useReducer(contextReducer, initialContextState)
  const reduced = useSyncExternalStore(subscribeReduced, reducedSnapshot, () => false)

  useEffect(() => {
    dispatch({ type: "capture", target, now: performance.now() })
  }, [target])

  const deadline = nextDeadline(state)
  useEffect(() => {
    if (deadline === null) return
    const id = setTimeout(
      () => dispatch({ type: "tick", now: performance.now() }),
      Math.max(0, deadline - performance.now()) + TIMER_SLACK_MS,
    )
    return () => clearTimeout(id)
  }, [deadline])

  useEffect(() => {
    // Command counts as Ctrl on macOS.
    const isCtrl = (e: KeyboardEvent) => e.key === "Control" || e.key === "Meta"
    const down = (e: KeyboardEvent) => {
      if (isCtrl(e) && !e.repeat) dispatch({ type: "ctrl", down: true, now: performance.now() })
    }
    const up = (e: KeyboardEvent) => {
      if (isCtrl(e)) dispatch({ type: "ctrl", down: false, now: performance.now() })
    }
    const blur = () => dispatch({ type: "blur", now: performance.now() })
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    window.addEventListener("blur", blur)
    document.addEventListener("visibilitychange", blur)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
      window.removeEventListener("blur", blur)
      document.removeEventListener("visibilitychange", blur)
    }
  }, [])

  const t = state.target
  const visible = state.phase !== "hidden"
  const expanded = state.phase === "expanded"
  const spoken = !t || !visible ? "" : expanded ? `${t.label}. ${t.context}` : HINT_TEXT

  return (
    <div className="cp" data-phase={state.phase}>
      <div aria-live="polite" className="sr-only">
        {spoken}
      </div>
      {t && (
        <div aria-hidden="true" className="cp-box">
          <div key={`${expanded ? "x" : "h"}:${t.id ?? t.label}`} className="cp-content">
            {expanded ? (
              <>
                <p className="cp-name">{t.label}</p>
                <p className="cp-text">
                  <ScrambleText text={t.context ?? ""} run={visible} durationMs={DECODE_MS} reduced={reduced} />
                </p>
              </>
            ) : (
              <p className="cp-hint">
                <ScrambleText text={HINT_TEXT} run={visible} durationMs={HINT_MS} reduced={reduced} />
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
