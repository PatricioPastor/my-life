/** ASCII only, so any UI font can draw every glyph. */
export const GLITCH_GLYPHS = "#%&*+=?/\\<>|~^$@01"

function hash(a: number, b: number, c: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2246822519)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * One scramble frame: characters resolve left to right as `progress` goes 0..1; the rest show
 * seeded random glyphs that change with `tick`. Spaces are kept, and progress >= 1 is the exact text.
 */
export function glitchFrame(text: string, progress: number, seed: number, tick: number): string {
  if (progress >= 1) return text
  const resolved = Math.floor(text.length * Math.max(progress, 0))
  let out = text.slice(0, resolved)
  for (let i = resolved; i < text.length; i++) {
    const ch = text[i]
    out += /\s/.test(ch) ? ch : GLITCH_GLYPHS[Math.floor(hash(seed, i, tick) * GLITCH_GLYPHS.length)]
  }
  return out
}

export interface GlitchOptions {
  durationMs: number
  fps: number
  seed: number
}

/** Every frame of a decode, first to last; the last one is always the target text. */
export function glitchFrames(text: string, { durationMs, fps, seed }: GlitchOptions): string[] {
  const steps = Math.ceil((durationMs / 1000) * fps)
  if (steps <= 0) return [text]
  const frames: string[] = []
  for (let i = 0; i <= steps; i++) frames.push(glitchFrame(text, i / steps, seed, i))
  return frames
}
