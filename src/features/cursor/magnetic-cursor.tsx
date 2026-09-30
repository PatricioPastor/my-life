"use client"

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react"
import {
  REST_FOLLOW,
  isInteractive,
  placeTooltip,
  resolveMagnet,
  shouldForwardClick,
  springProfile,
  stepFollow,
  stepSpring,
  type FollowState,
  type MagnetTarget,
  type Point,
  type SpringState,
} from "./magnet"

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
// The loop idles after this many frames with settled springs and unmoving targets.
const STABLE_FRAMES = 30
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

    const reducedQuery = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_MOTION) : null
    let reduced = reducedQuery?.matches ?? false
    const onReducedChange = (e: MediaQueryListEvent) => {
      reduced = e.matches
    }
    reducedQuery?.addEventListener("change", onReducedChange)

    const ids = new WeakMap<Element, string>()
    let nextId = 0
    let items: Item[] = []
    let targets: MagnetTarget[] = []
    let signature = ""
    let stableFrames = 0
    let pointer: Point | null = null
    let pressed = false
    let overField = false
    let shown = false
    let capturedId: string | null = null
    let follow: FollowState = REST_FOLLOW
    let sw: SpringState = { x: FREE_SIZE, v: 0 }
    let sh: SpringState = { x: FREE_SIZE, v: 0 }
    let tipW = 0
    let tipH = 0
    let last = 0
    let raf = 0
    let alive = true

    // Reads only. Called at the top of a frame, before any style write, so it never forces a layout.
    const measure = () => {
      items = []
      let sig = ""
      for (const el of stage.querySelectorAll<HTMLElement>("[data-magnetic]")) {
        if ((el as HTMLButtonElement).disabled) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        let id = ids.get(el)
        if (!id) {
          id = String(nextId++)
          ids.set(el, id)
        }
        sig += `${id}:${r.left.toFixed(1)},${r.top.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)};`
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
      stableFrames = sig === signature ? stableFrames + 1 : 0
      signature = sig
    }

    const setShown = (on: boolean) => {
      if (on === shown) return
      shown = on
      if (!on) follow = REST_FOLLOW
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
      // The press scales the target (`.press:active`); measuring through it would shift the capture.
      if (!pressed) measure()

      const p = pointer
      const active = p && !overField
      const res = active ? resolveMagnet(p, targets, capturedId) : null
      const item = res?.captured ? (items.find((i) => i.target.id === res.target?.id) ?? null) : null
      if ((item?.target.id ?? null) !== capturedId) capture(item)
      setShown(!!active)

      let gw = FREE_SIZE
      let gh = FREE_SIZE
      if (item) {
        const r = item.target.rect
        gw = Math.max(r.width + FRAME_PAD * 2, MIN_FRAME)
        gh = Math.max(r.height + FRAME_PAD * 2, MIN_FRAME)
      }

      const { omega } = springProfile(reduced)
      const want = res ? res.point : (p ?? { x: 0, y: 0 })
      let pos = p ?? want
      if (p) {
        const step = stepFollow(follow, p, want, dt, omega)
        follow = step.follow
        pos = step.position
      }
      sw = stepSpring(sw, gw, dt, omega, 1)
      sh = stepSpring(sh, gh, dt, omega, 1)

      frame.style.width = `${sw.x.toFixed(1)}px`
      frame.style.height = `${sh.x.toFixed(1)}px`
      frame.style.transform = `translate3d(${(pos.x - sw.x / 2).toFixed(1)}px, ${(pos.y - sh.x / 2).toFixed(1)}px, 0)`

      if (item) {
        const place = placeTooltip(
          { cx: pos.x, top: pos.y - sh.x / 2, bottom: pos.y + sh.x / 2 },
          { width: tipW, height: tipH },
          { width: window.innerWidth, height: window.innerHeight },
        )
        tip.style.transform = `translate3d(${(place.x - tipW / 2).toFixed(1)}px, ${place.y.toFixed(1)}px, 0)`
      }

      const settled =
        Math.abs(follow.ox.x - (want.x - (p?.x ?? 0))) < 0.05 && Math.abs(follow.oy.x - (want.y - (p?.y ?? 0))) < 0.05 &&
        Math.abs(follow.ox.v) + Math.abs(follow.oy.v) < 0.5 &&
        Math.abs(sw.x - gw) < 0.05 && Math.abs(sh.x - gh) < 0.05 && Math.abs(sw.v) + Math.abs(sh.v) < 0.5
      // Idle once the pointer is still, the springs are at rest and the targets have stopped moving
      // (the sky's parallax settles within a few hundred ms). Any pointer, scroll or DOM event wakes it.
      if (shown && (!settled || (!pressed && stableFrames < STABLE_FRAMES))) raf = requestAnimationFrame(tick)
    }

    const wake = () => {
      if (alive && !raf && !document.hidden) {
        last = performance.now()
        stableFrames = 0
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
    const captured = () => (capturedId === null ? undefined : items.find((i) => i.target.id === capturedId))
    // The captured item when a pointer event on `t` belongs to it rather than to what is under the pointer.
    const forwardTo = (t: Node | null, detail: number) => {
      const item = captured()
      if (!item || !item.el.isConnected || !t || !stage.contains(t)) return null
      const el = t instanceof Element ? t : t.parentElement
      const ok = shouldForwardClick({
        capturedId,
        insideCaptured: item.el.contains(t),
        detail,
        onInteractive: !el || isInteractive(el, stage),
      })
      return ok ? item : null
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") return
      pressed = true
      root.dataset.pressed = "on"
      // The reticle sits on the target, so a primary press on empty space beside it belongs to it: keep
      // the sky from reacting there. Presses on other controls, other buttons and outside the stage pass.
      if (e.button === 0 && forwardTo(e.target as Node | null, 1)) e.stopPropagation()
    }
    const onUp = () => {
      pressed = false
      delete root.dataset.pressed
      wake()
    }
    // A press can end without a pointerup (alt-tab, tab switch): never leave the reticle stuck pressed.
    const onHidden = () => {
      if (document.hidden || document.visibilityState === "hidden") onUp()
    }
    // What you see is what you click: the pull can leave the real pointer just outside the target.
    const onClick = (e: MouseEvent) => {
      const item = forwardTo(e.target as Node | null, e.detail)
      if (!item) return
      e.preventDefault()
      e.stopPropagation()
      item.el.click()
    }
    const invalidate = () => wake()

    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pointerdown", onDown, { capture: true })
    window.addEventListener("pointerup", onUp, { passive: true })
    window.addEventListener("pointercancel", onUp, { passive: true })
    window.addEventListener("click", onClick, { capture: true })
    window.addEventListener("blur", onUp)
    document.addEventListener("visibilitychange", onHidden)
    window.addEventListener("scroll", invalidate, { passive: true, capture: true })
    window.addEventListener("resize", invalidate)
    document.documentElement.addEventListener("mouseleave", onLeave)
    const mo = new MutationObserver((records) => {
      if (records.some((r) => !root.contains(r.target))) wake()
    })
    mo.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-magnetic", "disabled"] })

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      mo.disconnect()
      reducedQuery?.removeEventListener("change", onReducedChange)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerdown", onDown, { capture: true })
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      window.removeEventListener("click", onClick, { capture: true })
      window.removeEventListener("blur", onUp)
      document.removeEventListener("visibilitychange", onHidden)
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
        {/* The press feedback lives on this inner box: scaling the positioned frame would scale its translation. */}
        <div className="mc-body">
          <i className="mc-h" />
          <i className="mc-v" />
          <i className="mc-c mc-tl" />
          <i className="mc-c mc-tr" />
          <i className="mc-c mc-bl" />
          <i className="mc-c mc-br" />
        </div>
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
