"use client"

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import { layoutStack, panRatios, snapLayout, type LayoutParams, type StackBlock } from "./layout"
import { isSettled, settleProfile, stepSettle, type SettleState } from "./settle"

/** How much bigger the focused size is than the resting one: two steps of the 1.25 type scale (18 px body at rest, 28 px focused). */
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
  /** Pan step inside the focused paragraph. */
  pan: number
  reduced: boolean
  onMeasure: (ratios: readonly number[]) => void
}

/**
 * Drives the stack with a spring, straight on the DOM: one transform on the stack, and transform / opacity / filter on the blocks
 * near the focus. Nothing here goes through React state, and nothing reads layout while it animates: the block heights are
 * measured once (and again when the stage, a block or the font changes).
 *
 * While the spring moves, offsets are fractional 3D translates (smooth, compositor friendly). When it settles, the stack is
 * written once more for rest: offsets snapped to whole device pixels, plain 2D translates (no 3D layer), no scale on the focused
 * block (it renders at its native font size), exact opacity and `filter: none`. A block is never given `will-change`.
 */
export function useStackMotion({ stage, stack, blocks, readable, target, pan, reduced, onMeasure }: Options) {
  const spring = useRef<SettleState>({ x: target, v: 0 })
  const targetRef = useRef(target)
  // One spring per paragraph for its pan (only the focused one ever moves), on the same profile as the focus spring.
  const pans = useRef<SettleState[]>([])
  const panTargets = useRef<number[]>([])
  const onMeasureRef = useRef(onMeasure)
  useEffect(() => {
    onMeasureRef.current = onMeasure
  })
  const raf = useRef(0)
  const apply = useRef<(f: number, rest: boolean) => void>(() => {})
  // Whether the springs have settled, so a re-measure while at rest writes the snapped layout again.
  const atRest = useRef(false)
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
    // Where the stack starts on the page, so resting offsets can land on the page's pixel grid.
    let origin = 0

    const write = (f: number, rest: boolean) => {
      const els = blocks.current
      const moving = layoutStack(
        stackBlocks,
        f,
        params,
        pans.current.map((s) => s.x),
      )
      const layout = rest ? snapLayout(moving, window.devicePixelRatio || 1, origin) : moving
      // Only when it changes: a write of the same value is still a DOM mutation, and nothing here may churn per frame or per word.
      const settled = rest ? "true" : "false"
      if (stackEl.dataset.settled !== settled) stackEl.dataset.settled = settled
      const y = rest ? `translate(0, ${layout.y.toFixed(4)}px)` : `translate3d(0, ${layout.y.toFixed(2)}px, 0)`
      if (y !== lastStack) {
        stackEl.style.transform = y
        lastStack = y
      }
      stackBlocks.forEach((b, i) => {
        const el = els[i]
        if (!el) return
        const w = layout.weights[i]!
        const bs = layout.scales[i]!
        const t = rest
          ? `translate(0, ${layout.tops[i]}px)${bs === 1 ? "" : ` scale(${bs.toFixed(4)})`}`
          : `translate3d(0, ${layout.tops[i]!.toFixed(2)}px, 0) scale(${bs.toFixed(4)})`
        const o = w === 1 ? "1" : (b.readable >= 0 ? DIM_OPACITY + (1 - DIM_OPACITY) * w : el.tagName === "HR" ? BREAK_OPACITY : STILL_OPACITY).toFixed(3)
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
      origin = rect.top
      // The reading line is a share of the viewport, measured from the top of the stage.
      const viewport = stageEl.closest<HTMLElement>(".ob")?.clientHeight || window.innerHeight
      params = { ...params, scale, line: viewport * READING_LINE - rect.top, bottom: stageEl.clientHeight - EDGE_BOTTOM_PX }
      onMeasureRef.current(panRatios(stackBlocks, params))
    }

    apply.current = write
    measure.current = () => {
      read()
      write(spring.current.x, atRest.current)
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
    // The stage rises in (a transform animation) while it is first measured: measure again where it really ends up.
    const onRise = (e: AnimationEvent) => {
      if (e.target === stageEl) measure.current()
    }
    stageEl.addEventListener("animationend", onRise)
    return () => {
      stageEl.removeEventListener("animationend", onRise)
      observer?.disconnect()
      fonts?.removeEventListener?.("loadingdone", onFonts)
      window.removeEventListener("resize", onFonts)
    }
  }, [stage, stack, blocks, readable, reduced])

  // Spring toward the focused paragraph.
  useEffect(() => {
    targetRef.current = target
    panTargets.current[target] = pan
    if (!pans.current[target]) pans.current[target] = { x: pan, v: 0 }
    const profile = settleProfile(reduced)
    cancelAnimationFrame(raf.current)
    atRest.current = false
    let prev = performance.now()
    const frame = (t: number) => {
      const dt = Math.min(0.05, Math.max(0, (t - prev) / 1000))
      prev = t
      spring.current = stepSettle(spring.current, targetRef.current, dt, profile)
      let moving = !isSettled(spring.current, targetRef.current)
      if (!moving) spring.current = { x: targetRef.current, v: 0 }
      pans.current = pans.current.map((s, i) => {
        const goal = panTargets.current[i] ?? 0
        const next = stepSettle(s, goal, dt, profile)
        if (isSettled(next, goal)) return { x: goal, v: 0 }
        moving = true
        return next
      })
      atRest.current = !moving
      apply.current(spring.current.x, !moving)
      if (moving) raf.current = requestAnimationFrame(frame)
    }
    raf.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf.current)
  }, [target, pan, reduced])
}
