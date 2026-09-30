import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")

/** `--name: clamp(MINpx, ..., MAXpx);` -> [min, max]. */
function clampBounds(name: string): [number, number] {
  const m = new RegExp(`--${name}:\\s*clamp\\((\\d+(?:\\.\\d+)?)px,.*,\\s*(\\d+(?:\\.\\d+)?)px\\);`).exec(css)
  if (!m) throw new Error(`token --${name} not found`)
  return [Number(m[1]), Number(m[2])]
}

describe("type scale tokens", () => {
  const maxes = [1, 2, 3, 4, 5, 6].map((n) => clampBounds(`type-${n}`)[1])

  it("starts at an 18px body", () => {
    expect(maxes[0]).toBe(18)
  })

  it("keeps the 1.25 ratio between steps (rounded to a whole pixel)", () => {
    maxes.forEach((max, i) => {
      expect(Math.abs(max - 18 * 1.25 ** i)).toBeLessThan(0.6)
    })
  })

  it("shrinks every step on small screens and never below the body minimum", () => {
    for (let n = 1; n <= 6; n++) {
      const [min, max] = clampBounds(`type-${n}`)
      expect(min).toBeLessThan(max)
      expect(min).toBeGreaterThanOrEqual(16)
    }
  })
})

describe("spacing tokens", () => {
  it("keeps every --space-N a multiple of 8px", () => {
    const values = [...css.matchAll(/--space-\d+:\s*(\d+)px;/g)].map((m) => Number(m[1]))
    expect(values.length).toBeGreaterThan(5)
    for (const v of values) expect(v % 8).toBe(0)
  })

  it("bounds the page margin at 24px and 48px", () => {
    expect(clampBounds("page-pad")).toEqual([24, 48])
  })
})
