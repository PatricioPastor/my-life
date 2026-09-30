"use client"

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import { layoutStack, type LayoutParams, type StackBlock } from "./layout"
import { isSettled, settleProfile, stepSettle, type SettleState } from "./settle"

/** How much the focused paragraph grows: two steps of the 1.25 type scale, so 18 px body reads at 28 px. */
export const FOCUS_SCALE = 1.5625
/** Opacity and blur of a paragraph that is not in focus. */
export const DIM_OPACITY = 0.34
export const DIM_BLUR_PX = 1
const STILL_OPACITY = 0.5
const BREAK_OPACITY = 0.35
/** Where the focus sits, as a share of the viewport height. */
export const READING_LINE = 0.4
const GAP_PX = 24
const FOCUS_GAP_PX = 24
const EDGE_TOP_PX = 12
const EDGE_BOTTOM_PX = 40

interface Options {
  stage: RefObject<HTMLElement | null>
  stack: RefObject<HTMLElement | null>
  /** The block elements, by block index. */
  blocks: RefObject<(HTMLElement | null)[]>
  /** Readable index of each block (-1 for a subheading or break). */
  readable: readonly number[]
  /** The readable paragraph that has the focus. */
  target: number
  reduced: boolean
}

/**
 * Drives the stack with a spring, straight on the DOM: one transform on the stack, and transform / opacity / filter on the blocks
 * near the focus. Nothing here goes through React state, and nothing reads layout while it animates: the block heights are
 * measured once (and again when the stage, a block or the font changes).
 */
export function useStackMotion({ stage, stack, blocks, readable, target, reduced }: Options) {
  const spring = useRef<SettleState>({ x: target, v: 0 })
  const targetRef = useRef(target)
  const raf = useRef(0)
  const apply = useRef<(f: number) => void>(() => {})
  const measure = useRef<() => void>(() => {})

  // Measure and paint at the current position. Layout effect: the first frame is already in place.
  useLayoutEffect(() => {
    const stageEl = stage.current
    const stackEl = stack.current
    if (!stageEl || !stackEl) return
    const scale = reduced ? 1 : FOCUS_SCALE
    let stackBlocks: StackBlock[] = readable.map((r) => ({ height: 0, readable: r }))
    let params: LayoutParams = { scale, gap: GAP_PX, focusGap: FOCUS_GAP_PX, line: 0, top: EDGE_TOP_PX, bottom: 0 }
    const last: { t: string; o: string; f: string }[] = readable.map(() => ({ t: "", o: "", f: "" }))
    let lastStack = ""

    const write = (f: number) => {
      const els = blocks.current
      const layout = layoutStack(stackBlocks, f, params)
      const y = `translate3d(0, ${layout.y.toFixed(2)}px, 0)`
      if (y !== lastStack) {
        stackEl.style.transform = y
        lastStack = y
      }
      stackBlocks.forEach((b, i) => {
        const el = els[i]
        if (!el) return
        const w = layout.weights[i]!
        const t = `translate3d(0, ${layout.tops[i]!.toFixed(2)}px, 0) scale(${layout.scales[i]!.toFixed(4)})`
        const o = (b.readable >= 0 ? DIM_OPACITY + (1 - DIM_OPACITY) * w : el.tagName === "HR" ? BREAK_OPACITY : STILL_OPACITY).toFixed(3)
        const blur = b.readable >= 0 && !reduced ? DIM_BLUR_PX * (1 - w) : 0
        const fl = blur < 0.05 ? "none" : `blur(${blur.toFixed(2)}px)`
        const c = last[i]!
        if (c.t !== t) el.style.transform = c.t = t
        if (c.o !== o) el.style.opacity = c.o = o
        if (c.f !== fl) el.style.filter = c.f = fl
      })
    }

    const read = () => {
      const els = blocks.current
      stackBlocks = readable.map((r, i) => ({ height: els[i]?.offsetHeight ?? 0, readable: r }))
      const rect = stageEl.getBoundingClientRect()
      // The reading line is a share of the viewport, measured from the top of the stage.
      const viewport = stageEl.closest<HTMLElement>(".ob")?.clientHeight || window.innerHeight
      params = { ...params, scale, line: viewport * READING_LINE - rect.top, bottom: stageEl.clientHeight - EDGE_BOTTOM_PX }
    }

    apply.current = write
    measure.current = () => {
      read()
      write(spring.current.x)
    }
    measure.current()

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measure.current())
    observer?.observe(stageEl)
    for (const el of blocks.current) if (el) observer?.observe(el)
    const fonts = typeof document !== "undefined" ? document.fonts : undefined
    const onFonts = () => measure.current()
    fonts?.addEventListener?.("loadingdone", onFonts)
    void fonts?.ready?.then(onFonts)
    window.addEventListener("resize", onFonts)
    return () => {
      observer?.disconnect()
      fonts?.removeEventListener?.("loadingdone", onFonts)
      window.removeEventListener("resize", onFonts)
    }
  }, [stage, stack, blocks, readable, reduced])

  // Spring toward the focused paragraph.
  useEffect(() => {
    targetRef.current = target
    const profile = settleProfile(reduced)
    cancelAnimationFrame(raf.current)
    let prev = performance.now()
    const frame = (t: number) => {
      const dt = Math.min(0.05, Math.max(0, (t - prev) / 1000))
      prev = t
      spring.current = stepSettle(spring.current, targetRef.current, dt, profile)
      if (isSettled(spring.current, targetRef.current)) {
        spring.current = { x: targetRef.current, v: 0 }
        apply.current(spring.current.x)
        return
      }
      apply.current(spring.current.x)
      raf.current = requestAnimationFrame(frame)
    }
    raf.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf.current)
  }, [target, reduced])
}
