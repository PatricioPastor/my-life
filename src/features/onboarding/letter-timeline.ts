/** Pure timeline for assembling a phrase letter by letter. No DOM, no clock: the same inputs always give the same output. */

export interface TimelineOpts {
  /** Time a fully formed phrase stays on screen. */
  holdMs: number
  /** Whether the phrase fades out again (the last phrase stays for the CTA). */
  exit: boolean
  /** Base left-to-right step between letters. */
  stepMs?: number
  /** Extra seeded delay per letter; keep it below `stepMs` so the order is preserved. */
  jitterMs?: number
}

export interface LetterSpec {
  char: string
  /** Spaces are laid out but never animated. */
  space: boolean
  /** Irregular origin, in px / deg. The letter settles at its exact place. */
  dx: number
  dy: number
  rot: number
  scale: number
  blur: number
  /** Entrance delay and travel time, in ms. */
  delay: number
  dur: number
  /** Exit: drift in px, plus its own delay and time in ms. */
  xy: number
  xdelay: number
  xdur: number
}

export interface LetterTimeline {
  letters: LetterSpec[]
  enterMs: number
  holdMs: number
  exitMs: number
  /** Offset from the start of the phase at which the exit begins. */
  exitAtMs: number
  totalMs: number
}

export const STEP_MS = 65
export const JITTER_MS = 60
const DUR_MIN = 900
const DUR_MAX = 1200
const EXIT_STAGGER_MS = 180
const EXIT_DUR_MIN = 440
const EXIT_DUR_MAX = 470

/** FNV-1a: turns any seed into a 32-bit number. */
function hash(seed: string | number): number {
  const s = String(seed)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: small, fast, deterministic. */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10

export function letterTimeline(text: string, seed: string | number, opts: TimelineOpts): LetterTimeline {
  const step = opts.stepMs ?? STEP_MS
  const jitter = opts.jitterMs ?? JITTER_MS
  const rand = rng(hash(seed))
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo)
  const sign = () => (rand() < 0.5 ? -1 : 1)

  const letters: LetterSpec[] = Array.from(text).map((char, i) => {
    if (char === " ") {
      return { char, space: true, dx: 0, dy: 0, rot: 0, scale: 1, blur: 0, delay: 0, dur: 0, xy: 0, xdelay: 0, xdur: 0 }
    }
    return {
      char,
      space: false,
      dx: r1(sign() * between(28, 60)),
      dy: r1(sign() * between(28, 60)),
      rot: r1(sign() * between(8, 18)),
      scale: Math.round(between(0.85, 0.95) * 100) / 100,
      blur: r1(between(4, 6)),
      // Index keeps left-to-right; jitter (< step) keeps the order strict.
      delay: Math.round(i * step + between(0, jitter)),
      dur: Math.round(between(DUR_MIN, DUR_MAX)),
      xy: r1(between(-6, -3)),
      xdelay: Math.round(between(0, EXIT_STAGGER_MS)),
      xdur: Math.round(between(EXIT_DUR_MIN, EXIT_DUR_MAX)),
    }
  })

  const moving = letters.filter((l) => !l.space)
  const enterMs = moving.reduce((m, l) => Math.max(m, l.delay + l.dur), 0)
  const exitMs = opts.exit ? moving.reduce((m, l) => Math.max(m, l.xdelay + l.xdur), 0) : 0
  const holdMs = opts.holdMs

  return { letters, enterMs, holdMs, exitMs, exitAtMs: enterMs + holdMs, totalMs: enterMs + holdMs + exitMs }
}
