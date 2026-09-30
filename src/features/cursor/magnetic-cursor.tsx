"use client"

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react"
import { placeTooltip, resolveMagnet, springProfile, stepSpring, type MagnetTarget, type Point, type SpringState } from "./magnet"

/** What the cursor reports when it captures (or lets go of) a `data-magnetic` element. */
export interface CursorTarget {
  /** `data-cursor-id`: a stable id the app maps to its own model, for example a facet id. */
  id: string | null
  label: string
  /** `data-cursor-context`: the longer explanation revealed with Ctrl. */
  context: string | null
}

interface MagneticCursorProps {
  /** The stage: the native cursor is hidden inside it, and its `data-magnetic` elements are the targets. */
  stageRef: RefObject<HTMLElement | null>
  onCapture?: (target: CursorTarget | null) => void
}

const FINE_POINTER = "(hover: hover) and (pointer: fine)"
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"
const FREE_SIZE = 22
const FRAME_PAD = 6
const MIN_FRAME = 28
// Rects are cached; they are re-read at most this often (plus on scroll, resize and DOM changes).
const REMEASURE_MS = 120
const FIELD = "input,textarea,select,[contenteditable='true']"

function subscribeFine(notify: () => void) {
  const mq = typeof window.matchMedia === "function" ? window.matchMedia(FINE_POINTER) : null
  mq?.addEventListener("change", notify)
  return () => mq?.removeEventListener("change", notify)
}
const fineSnapshot = () => typeof window.matchMedia === "function" && window.matchMedia(FINE_POINTER).matches

interface Item {
  el: HTMLElement
  target: MagnetTarget
  info: CursorTarget
}

/** A pixel reticle that bends toward `data-magnetic` elements, frames the one it captures and names it. */
export function MagneticCursor(props: MagneticCursorProps) {
  const fine = useSyncExternalStore(subscribeFine, fineSnapshot, () => false)
  return fine ? <Reticle {...props} /> : null
}

function Reticle({ stageRef, onCapture }: MagneticCursorProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const keyRef = useRef<HTMLElement>(null)
  const onCaptureRef = useRef(onCapture)
  useEffect(() => {
    onCaptureRef.current = onCapture
  })

  useEffect(() => {
    const stage = stageRef.current
    const root = rootRef.current
    const frame = frameRef.current
    const tip = tipRef.current
    const label = labelRef.current
    const key = keyRef.current
    if (!stage || !root || !frame || !tip || !label || !key) return
    stage.dataset.cursor = "on"

    const ids = new WeakMap<Element, string>()
    let nextId = 0
    let items: Item[] = []
    let targets: MagnetTarget[] = []
    let measuredAt = -Infinity
    let dirty = true
    let pointer: Point | null = null
    let overField = false
    let shown = false
    let capturedId: string | null = null
    let sx: SpringState = { x: 0, v: 0 }
    let sy: SpringState = { x: 0, v: 0 }
    let sw: SpringState = { x: FREE_SIZE, v: 0 }
    let sh: SpringState = { x: FREE_SIZE, v: 0 }
    let tipW = 0
    let tipH = 0
    let last = 0
    let raf = 0
    let alive = true

    const measure = (now: number) => {
      items = []
      for (const el of stage.querySelectorAll<HTMLElement>("[data-magnetic]")) {
        if ((el as HTMLButtonElement).disabled) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        let id = ids.get(el)
        if (!id) {
          id = String(nextId++)
          ids.set(el, id)
        }
        items.push({
          el,
          target: {
            id,
            strength: el.dataset.magnetic === "strong" ? "strong" : "light",
            rect: { left: r.left, top: r.top, width: r.width, height: r.height },
          },
          info: {
            id: el.dataset.cursorId ?? null,
            label: el.dataset.cursorLabel ?? "",
            context: el.dataset.cursorContext ?? null,
          },
        })
      }
      targets = items.map((i) => i.target)
      measuredAt = now
      dirty = false
    }

    const setShown = (on: boolean) => {
      if (on === shown) return
      shown = on
      if (!on) delete root.dataset.snap
      root.dataset.visible = on ? "on" : "off"
    }

    const capture = (item: Item | null) => {
      capturedId = item ? item.target.id : null
      root.dataset.state = item ? "captured" : "free"
      if (item) {
        label.textContent = item.info.label
        key.hidden = !item.info.context
        tip.dataset.tip = "on"
        tipW = tip.offsetWidth
        tipH = tip.offsetHeight
      } else {
        tip.dataset.tip = "off"
      }
      onCaptureRef.current?.(item ? item.info : null)
    }

    const tick = (now: number) => {
      raf = 0
      if (!alive) return
      const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05)
      last = now
      if (dirty || now - measuredAt > REMEASURE_MS) measure(now)

      const p = pointer
      const active = p && !overField
      const res = active ? resolveMagnet(p, targets, capturedId) : null
      const item = res?.captured ? (items.find((i) => i.target.id === res.target?.id) ?? null) : null
      if ((item?.target.id ?? null) !== capturedId) capture(item)
      setShown(!!active)

      let gx = p?.x ?? 0
      let gy = p?.y ?? 0
      let gw = FREE_SIZE
      let gh = FREE_SIZE
      if (res) {
        gx = res.point.x
        gy = res.point.y
      }
      if (item) {
        const r = item.target.rect
        gw = Math.max(r.width + FRAME_PAD * 2, MIN_FRAME)
        gh = Math.max(r.height + FRAME_PAD * 2, MIN_FRAME)
      }

      const { omega, zeta } = springProfile(window.matchMedia?.(REDUCED_MOTION).matches ?? false)
      if (active && root.dataset.snap !== "done") {
        sx = { x: gx, v: 0 }
        sy = { x: gy, v: 0 }
        root.dataset.snap = "done"
      }
      sx = stepSpring(sx, gx, dt, omega, zeta)
      sy = stepSpring(sy, gy, dt, omega, zeta)
      sw = stepSpring(sw, gw, dt, omega, 1)
      sh = stepSpring(sh, gh, dt, omega, 1)

      frame.style.width = `${sw.x.toFixed(1)}px`
      frame.style.height = `${sh.x.toFixed(1)}px`
      frame.style.transform = `translate3d(${(sx.x - sw.x / 2).toFixed(1)}px, ${(sy.x - sh.x / 2).toFixed(1)}px, 0)`

      if (item) {
        const place = placeTooltip(
          { cx: sx.x, top: sy.x - sh.x / 2, bottom: sy.x + sh.x / 2 },
          { width: tipW, height: tipH },
          { width: window.innerWidth, height: window.innerHeight },
        )
        tip.style.transform = `translate3d(${(place.x - tipW / 2).toFixed(1)}px, ${place.y.toFixed(1)}px, 0)`
      }

      const settled =
        Math.abs(sx.x - gx) < 0.05 && Math.abs(sy.x - gy) < 0.05 && Math.abs(sw.x - gw) < 0.05 && Math.abs(sh.x - gh) < 0.05 &&
        Math.abs(sx.v) + Math.abs(sy.v) < 0.5
      // A captured target keeps the loop alive so the frame follows the sky's parallax drift.
      if (shown && (!settled || capturedId !== null)) raf = requestAnimationFrame(tick)
    }

    const wake = () => {
      if (alive && !raf && !document.hidden) {
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return
      const t = e.target as Element | null
      if (!t || !stage.contains(t)) {
        pointer = null
        wake()
        return
      }
      pointer = { x: e.clientX, y: e.clientY }
      overField = !!t.closest(FIELD)
      wake()
    }
    const onLeave = () => {
      pointer = null
      wake()
    }
    const onDown = () => {
      root.dataset.pressed = "on"
    }
    const onUp = () => {
      delete root.dataset.pressed
    }
    const invalidate = () => {
      dirty = true
      wake()
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pointerdown", onDown, { passive: true })
    window.addEventListener("pointerup", onUp, { passive: true })
    window.addEventListener("scroll", invalidate, { passive: true, capture: true })
    window.addEventListener("resize", invalidate)
    document.documentElement.addEventListener("mouseleave", onLeave)
    const mo = new MutationObserver(invalidate)
    mo.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-magnetic", "disabled"] })

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      mo.disconnect()
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerdown", onDown)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("scroll", invalidate, { capture: true })
      window.removeEventListener("resize", invalidate)
      document.documentElement.removeEventListener("mouseleave", onLeave)
      delete stage.dataset.cursor
      if (capturedId !== null) onCaptureRef.current?.(null)
    }
  }, [stageRef])

  return (
    <div ref={rootRef} aria-hidden="true" className="mc" data-visible="off" data-state="free">
      <div ref={frameRef} className="mc-frame">
        <i className="mc-h" />
        <i className="mc-v" />
        <i className="mc-c mc-tl" />
        <i className="mc-c mc-tr" />
        <i className="mc-c mc-bl" />
        <i className="mc-c mc-br" />
      </div>
      <div ref={tipRef} className="mc-tip" data-tip="off">
        <span ref={labelRef} />
        <kbd ref={keyRef} className="mc-key" hidden>
          Ctrl
        </kbd>
      </div>
    </div>
  )
}
