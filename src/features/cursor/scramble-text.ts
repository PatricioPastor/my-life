const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const LOWER = "abcdefghijklmnopqrstuvwxyz"
const DIGITS = "0123456789"

function hash(a: number, b: number, c: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2246822519)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Same-kind replacement keeps glyph widths close; anything else (space, punctuation, accents) stays. */
function pool(ch: string): string | null {
  if (ch >= "A" && ch <= "Z") return UPPER
  if (ch >= "a" && ch <= "z") return LOWER
  if (ch >= "0" && ch <= "9") return DIGITS
  return null
}

/**
 * One scramble frame: characters resolve left to right as `progress` goes 0..1; the rest show seeded
 * random letters or digits of the same case that change with `tick`. Everything else is kept, and
 * progress >= 1 is the exact text.
 */
export function scrambleFrame(text: string, progress: number, seed: number, tick: number): string {
  if (progress >= 1) return text
  const resolved = Math.floor(text.length * Math.max(progress, 0))
  let out = text.slice(0, resolved)
  for (let i = resolved; i < text.length; i++) {
    const ch = text[i]
    const chars = pool(ch)
    out += chars ? chars[Math.floor(hash(seed, i, tick) * chars.length)] : ch
  }
  return out
}

export interface ScrambleOptions {
  durationMs: number
  stepMs: number
  seed: number
}

/** Every frame of a decode, first to last; the last one is always the target text. */
export function scrambleFrames(text: string, { durationMs, stepMs, seed }: ScrambleOptions): string[] {
  const steps = Math.ceil(durationMs / stepMs)
  if (!(steps > 0)) return [text]
  const frames: string[] = []
  for (let i = 0; i <= steps; i++) frames.push(scrambleFrame(text, i / steps, seed, i))
  return frames
}
