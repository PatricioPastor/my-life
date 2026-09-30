import { describe, expect, it } from "vitest"
import { GRAIN_FPS, fillGrain } from "./grain"

describe("fillGrain", () => {
  it("fills every pixel with an opaque grey from the random source", () => {
    const buf = new Uint32Array(4)
    const values = [0, 0.5, 0.999, 0.25]
    let i = 0
    fillGrain(buf, () => values[i++])
    const bytes = new Uint8Array(buf.buffer)
    for (let p = 0; p < 4; p++) {
      const [r, g, b, a] = bytes.slice(p * 4, p * 4 + 4)
      expect(r).toBe(g)
      expect(g).toBe(b)
      expect(a).toBe(255)
    }
    expect(bytes[0]).toBe(0)
    expect(bytes[4]).toBe(128)
    expect(bytes[8]).toBe(255)
  })

  it("runs at a film-like frame rate", () => {
    expect(GRAIN_FPS).toBe(12)
  })
})
