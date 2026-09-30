/**
 * The geometry of the reading stack. Pure, and run every animation frame, so it only does arithmetic on numbers measured once.
 *
 * Every block is laid out small (the resting size) and absolutely positioned; the focused one is scaled up with a transform.
 * Uniform scaling keeps every line break where it was, so focus never reflows text, and only transforms move.
 */

export interface StackBlock {
  /** Laid-out height at the resting size (a transform does not change it). */
  height: number
  /** Index among the readable blocks, or -1 for a subheading or break: those never take the focus. */
  readable: number
}

export interface LayoutParams {
  /** How much the focused block grows (1 for reduced motion). */
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

/**
 * The scale a paragraph takes when focused: the full `scale`, or less when that would make it taller than the reading area,
 * but never below 1. A block that is not measured yet counts as fitting.
 */
export function focusScaleFor(height: number, p: Pick<LayoutParams, "scale" | "top" | "bottom">): number {
  const room = p.bottom - p.top
  if (height <= 0 || room <= 0) return p.scale
  return Math.max(1, Math.min(p.scale, room / height))
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
  const scales = weights.map((w, i) => 1 + (focusScaleFor(blocks[i]!.height, p) - 1) * w)
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
