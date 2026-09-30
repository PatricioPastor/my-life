import { describe, expect, it } from "vitest"
import { GLITCH_GLYPHS, glitchFrame, glitchFrames } from "./glitch-text"

const TEXT = "Relatos de mi vida, en primera persona."

describe("glitchFrame", () => {
  it("returns the exact text at full progress", () => {
    expect(glitchFrame(TEXT, 1, 7, 3)).toBe(TEXT)
    expect(glitchFrame(TEXT, 1.5, 7, 3)).toBe(TEXT)
  })

  it("keeps the length and the spaces at every progress", () => {
    for (const p of [0, 0.2, 0.5, 0.9]) {
      const f = glitchFrame(TEXT, p, 1, 4)
      expect(f).toHaveLength(TEXT.length)
      for (let i = 0; i < TEXT.length; i++) if (TEXT[i] === " ") expect(f[i]).toBe(" ")
    }
  })

  it("resolves left to right", () => {
    const f = glitchFrame(TEXT, 0.5, 1, 4)
    const resolved = Math.floor(TEXT.length * 0.5)
    expect(f.slice(0, resolved)).toBe(TEXT.slice(0, resolved))
    // Past the frontier every letter is still scrambled into the glyph set.
    for (let i = resolved; i < TEXT.length; i++) {
      if (TEXT[i] !== " ") expect(GLITCH_GLYPHS).toContain(f[i])
    }
  })

  it("is deterministic for a seed and tick, and changes with the tick or seed", () => {
    expect(glitchFrame(TEXT, 0.3, 9, 2)).toBe(glitchFrame(TEXT, 0.3, 9, 2))
    expect(glitchFrame(TEXT, 0.3, 9, 2)).not.toBe(glitchFrame(TEXT, 0.3, 9, 3))
    expect(glitchFrame(TEXT, 0.3, 9, 2)).not.toBe(glitchFrame(TEXT, 0.3, 10, 2))
  })

  it("handles empty text", () => {
    expect(glitchFrame("", 0.5, 1, 1)).toBe("")
  })
})

describe("glitchFrames", () => {
  it("spans the duration at the frame rate and always ends on the target text", () => {
    const frames = glitchFrames(TEXT, { durationMs: 300, fps: 30, seed: 5 })
    expect(frames).toHaveLength(10)
    expect(frames[frames.length - 1]).toBe(TEXT)
    expect(frames[0]).not.toBe(TEXT)
  })

  it("is repeatable and always has at least the final frame", () => {
    expect(glitchFrames(TEXT, { durationMs: 450, fps: 30, seed: 5 })).toEqual(
      glitchFrames(TEXT, { durationMs: 450, fps: 30, seed: 5 }),
    )
    expect(glitchFrames("a", { durationMs: 0, fps: 30, seed: 1 })).toEqual(["a"])
  })

  it("never reveals more characters as time goes backwards", () => {
    const frames = glitchFrames(TEXT, { durationMs: 450, fps: 30, seed: 2 })
    let last = -1
    for (const f of frames) {
      let n = 0
      while (n < f.length && f[n] === TEXT[n]) n++
      expect(n).toBeGreaterThanOrEqual(last)
      last = n
    }
  })
})
