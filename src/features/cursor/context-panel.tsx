"use client"

import { useEffect, useReducer, useRef, useSyncExternalStore } from "react"
import { contextReducer, initialContextState, nextDeadline } from "./context-machine"
import { glitchFrame } from "./glitch-text"
import type { CursorTarget } from "./magnetic-cursor"

export const HINT_TEXT = "Mantén Ctrl para saber más"
const HINT_MS = 300
const DECODE_MS = 480
const FRAME_MS = 1000 / 30
// Timers can fire a hair early; this keeps a tick from landing just before its deadline.
const TIMER_SLACK_MS = 4

const REDUCED = "(prefers-reduced-motion: reduce)"
function subscribeReduced(notify: () => void) {
  const mq = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED) : null
  mq?.addEventListener("change", notify)
  return () => mq?.removeEventListener("change", notify)
}
const reducedSnapshot = () => typeof window.matchMedia === "function" && window.matchMedia(REDUCED).matches

const seedOf = (text: string) => {
  let h = 7
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0
  return h
}

/** Decodes into `text` imperatively (no React state per frame); the final frame is always the exact text. */
function GlitchText({ text, run, durationMs, reduced }: { text: string; run: boolean; durationMs: number; reduced: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!run || reduced) {
      el.textContent = text
      return
    }
    const seed = seedOf(text)
    const start = performance.now()
    let raf = 0
    let shown = -1
    const step = (now: number) => {
      const progress = (now - start) / durationMs
      const tick = Math.floor((now - start) / FRAME_MS)
      if (tick !== shown) {
        shown = tick
        el.textContent = glitchFrame(text, progress, seed, tick)
      }
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    el.textContent = glitchFrame(text, 0, seed, 0)
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [text, run, durationMs, reduced])
  return <span ref={ref} />
}

interface ContextPanelProps {
  /** The star the cursor has captured, or null. Only targets with a description are used. */
  target: CursorTarget | null
}

/** Bottom-right: a glitching hint after a dwell on a star, and its description while Ctrl is held. */
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
                  <GlitchText text={t.context ?? ""} run={visible} durationMs={DECODE_MS} reduced={reduced} />
                </p>
              </>
            ) : (
              <p className="cp-hint">
                <GlitchText text={HINT_TEXT} run={visible} durationMs={HINT_MS} reduced={reduced} />
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
