/**
 * The geometry of the reading stack. Pure, and run every animation frame, so it only does arithmetic on numbers measured once.
 *
 * Every block is laid out at the focused reading size and absolutely positioned; the ones out of focus are scaled DOWN with a
 * transform (by 1 / `scale`). The focused block therefore renders at its native font size, never stretched, which is what keeps
 * it sharp. Uniform scaling keeps every line break where it was, so focus never reflows text, and only transforms move.
 */

export interface StackBlock {
  /** Laid-out height at the focused size (a transform does not change it). */
  height: number
  /** Index among the readable blocks, or -1 for a subheading or break: those never take the focus. */
  readable: number
}

export interface LayoutParams {
  /** How much bigger the focused size is than the resting size (1 for reduced motion): out of focus, blocks take 1 / scale. */
  scale: number
  /** Space between blocks at rest. */
  gap: number
  /** Extra space beside the focused block, so the bigger text breathes. */
  focusGap: number
  /** Where the centre of the focused block sits: y within the stage. */
  line: number
  /** The room the focused block may use: it is nudged to stay inside and top-aligned if it is taller than the room. */
  top: number
  bottom: number
}

export interface StackLayout {
  /** 0-1 focus of each block. */
  weights: number[]
  scales: number[]
  /** Top of each block inside the stack. */
  tops: number[]
  /** Translation of the whole stack that centres the focus on the line. */
  y: number
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** One pan step moves the paragraph by this share of the reading area, so the last lines of the view stay in sight. */
export const PAN_STEP = 0.65
/** While painting, the painted word is kept above this share of the reading area. */
export const PAN_FOLLOW = 0.85

/** The scale of a block out of focus. */
export function restScale(p: Pick<LayoutParams, "scale">): number {
  return 1 / Math.max(1, p.scale)
}

/**
 * The scale a paragraph takes when focused: 1 (its native size), or smaller when it would be taller than the reading area,
 * but never below the resting scale. A block that is not measured yet counts as fitting.
 */
export function focusScaleFor(height: number, p: Pick<LayoutParams, "scale" | "top" | "bottom">): number {
  const room = p.bottom - p.top
  if (height <= 0 || room <= 0) return 1
  return Math.max(restScale(p), Math.min(1, room / height))
}

/** Rounds a CSS px length to a whole device pixel, so resting text lands on the pixel grid. */
export function snapPx(v: number, dpr: number): number {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  return Math.round(v * d) / d
}

/**
 * The layout at rest: stack and block offsets on whole device pixels, and a scale that is 1 within noise is exactly 1.
 * `origin` is where the stack's box starts on the page (the stage's top, which may sit between pixels): the stack offset is
 * snapped so that `origin + y` lands on the grid, and the block offsets (whole pixels) keep it there.
 */
export function snapLayout(layout: StackLayout, dpr: number, origin = 0): StackLayout {
  return {
    weights: layout.weights,
    scales: layout.scales.map((s) => (Math.abs(s - 1) < 1e-3 ? 1 : s)),
    tops: layout.tops.map((t) => snapPx(t, dpr)),
    y: snapPx(layout.y + origin, dpr) - origin,
  }
}

/** How many reading areas tall each readable paragraph is at its focus scale (above 1 means it needs panning). */
export function panRatios(blocks: readonly StackBlock[], p: LayoutParams): number[] {
  const room = p.bottom - p.top
  const out: number[] = []
  for (const b of blocks) if (b.readable >= 0) out[b.readable] = room > 0 ? (b.height * focusScaleFor(b.height, p)) / room : 0
  return out
}

/** Pan steps a paragraph of that many reading areas needs to bring its end into view. */
export function panSteps(ratio: number): number {
  return ratio <= 1 ? 0 : Math.ceil((ratio - 1) / PAN_STEP - 1e-9)
}

/** The pan step that keeps the word at `fraction` (0-1) of the paragraph in view while it paints. */
export function autoPanStep(ratio: number, fraction: number): number {
  const k = Math.ceil((fraction * ratio - PAN_FOLLOW) / PAN_STEP - 1e-9)
  return clamp(k, 0, panSteps(ratio))
}

/**
 * Lay the stack out for a focus position `f`, in readable-block units: 1 is the second paragraph, 1.5 is halfway to the third.
 * `pans` are the pan positions (in steps, may be fractional mid-animation) of each readable paragraph: a paragraph taller than the
 * reading area shows a window of itself, moved by panning. `f` may overshoot the ends (the spring bounces): the stack follows, and no weight goes negative.
 */
export function layoutStack(blocks: readonly StackBlock[], f: number, p: LayoutParams, pans: readonly number[] = []): StackLayout {
  const weights = blocks.map((b) => (b.readable >= 0 ? clamp(1 - Math.abs(f - b.readable), 0, 1) : 0))
  const rest = restScale(p)
  const scales = weights.map((w, i) => rest + (focusScaleFor(blocks[i]!.height, p) - rest) * w)
  const visual = blocks.map((b, i) => b.height * scales[i]!)

  const tops: number[] = []
  let cursor = 0
  blocks.forEach((_, i) => {
    tops.push(cursor)
    const next = weights[i + 1] ?? 0
    cursor += visual[i]! + p.gap + p.focusGap * Math.max(weights[i]!, next)
  })

  const readable: number[] = []
  blocks.forEach((b, i) => {
    if (b.readable >= 0) readable[b.readable] = i
  })
  if (readable.length === 0) return { weights, scales, tops, y: 0 }

  const room = p.bottom - p.top
  // The part of a block in view: all of it, or a window of the reading area's size moved down by the pan.
  const shown = (i: number): number => (room > 0 ? Math.min(visual[i]!, room) : visual[i]!)
  const pan = (i: number): number => room > 0 ? clamp((pans[blocks[i]!.readable] ?? 0) * PAN_STEP * room, 0, Math.max(0, visual[i]! - room)) : 0
  const centre = (i: number): number => tops[i]! + pan(i) + shown(i) / 2
  // Interpolate between the two readable blocks around `f`; past either end it carries on along the same line.
  const a = readable.length === 1 ? 0 : clamp(Math.floor(f), 0, readable.length - 2)
  const b = Math.min(a + 1, readable.length - 1)
  const t = b === a ? 0 : f - a
  const ia = readable[a]!
  const ib = readable[b]!
  const at = centre(ia) + (centre(ib) - centre(ia)) * t
  const height = shown(ia) + (shown(ib) - shown(ia)) * clamp(t, 0, 1)

  const lo = p.top + height / 2
  const hi = p.bottom - height / 2
  const desired = lo > hi ? lo : clamp(p.line, lo, hi)
  return { weights, scales, tops, y: desired - at }
}
