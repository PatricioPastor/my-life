import { describe, expect, it } from "vitest"
import { scrambleFrame, scrambleFrames } from "./scramble-text"

const TEXT = "Cosas que construí y estoy construyendo, ¿1 vez? Mañana: 2026."
const isScrambleable = (ch: string) => /[A-Za-z0-9]/.test(ch)
const kind = (ch: string) => (/[A-Z]/.test(ch) ? "upper" : /[a-z]/.test(ch) ? "lower" : /[0-9]/.test(ch) ? "digit" : "other")

describe("scrambleFrame", () => {
  it("returns the exact text at full progress", () => {
    expect(scrambleFrame(TEXT, 1, 7, 3)).toBe(TEXT)
    expect(scrambleFrame(TEXT, 1.5, 7, 3)).toBe(TEXT)
  })

  it("keeps the length, spaces, punctuation and accents in every frame", () => {
    for (const p of [0, 0.2, 0.5, 0.9]) {
      for (const tick of [0, 1, 5]) {
        const f = scrambleFrame(TEXT, p, 1, tick)
        expect(f).toHaveLength(TEXT.length)
        for (let i = 0; i < TEXT.length; i++) if (!isScrambleable(TEXT[i])) expect(f[i]).toBe(TEXT[i])
      }
    }
  })

  it("replaces letters and digits only with the same kind (no symbols)", () => {
    for (const tick of [0, 1, 2, 3, 4, 5, 6]) {
      const f = scrambleFrame(TEXT, 0, 3, tick)
      for (let i = 0; i < TEXT.length; i++) {
        if (isScrambleable(TEXT[i])) {
          expect(f[i]).toMatch(/^[A-Za-z0-9]$/)
          expect(kind(f[i])).toBe(kind(TEXT[i]))
        }
      }
    }
  })

  it("resolves left to right", () => {
    const f = scrambleFrame(TEXT, 0.5, 1, 4)
    const resolved = Math.floor(TEXT.length * 0.5)
    expect(f.slice(0, resolved)).toBe(TEXT.slice(0, resolved))
    let changed = 0
    for (let i = resolved; i < TEXT.length; i++) if (f[i] !== TEXT[i]) changed++
    expect(changed).toBeGreaterThan(0)
  })

  it("is deterministic for a seed and tick, and changes with the tick or seed", () => {
    expect(scrambleFrame(TEXT, 0.3, 9, 2)).toBe(scrambleFrame(TEXT, 0.3, 9, 2))
    expect(scrambleFrame(TEXT, 0.3, 9, 2)).not.toBe(scrambleFrame(TEXT, 0.3, 9, 3))
    expect(scrambleFrame(TEXT, 0.3, 9, 2)).not.toBe(scrambleFrame(TEXT, 0.3, 10, 2))
  })

  it("handles empty text", () => {
    expect(scrambleFrame("", 0.5, 1, 1)).toBe("")
  })
})

describe("scrambleFrames", () => {
  it("has duration / step + 1 frames and always ends on the exact text", () => {
    const frames = scrambleFrames(TEXT, { durationMs: 800, stepMs: 40, seed: 5 })
    expect(frames).toHaveLength(21)
    expect(frames[frames.length - 1]).toBe(TEXT)
    expect(frames[0]).not.toBe(TEXT)
  })

  it("rounds a partial step up so the duration is covered", () => {
    expect(scrambleFrames(TEXT, { durationMs: 500, stepMs: 40, seed: 5 })).toHaveLength(14)
  })

  it("is repeatable and always has at least the final frame", () => {
    const opts = { durationMs: 800, stepMs: 40, seed: 5 }
    expect(scrambleFrames(TEXT, opts)).toEqual(scrambleFrames(TEXT, opts))
    expect(scrambleFrames("a", { durationMs: 0, stepMs: 40, seed: 1 })).toEqual(["a"])
  })

  it("never reveals fewer characters as time goes forward", () => {
    const frames = scrambleFrames(TEXT, { durationMs: 800, stepMs: 40, seed: 2 })
    let last = -1
    for (const f of frames) {
      let n = 0
      while (n < f.length && f[n] === TEXT[n]) n++
      expect(n).toBeGreaterThanOrEqual(last)
      last = n
    }
  })
})
