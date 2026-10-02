import { describe, expect, it } from "vitest"
import { BAR_COUNT, BAR_REST, barScale, barTargets, stepBars } from "./audio-bars"

const spectrum = (bins: number, fill: (bin: number) => number) => Uint8Array.from({ length: bins }, (_, bin) => fill(bin))

describe("barTargets", () => {
  it("is silent for silence, an empty spectrum, and anything that is not a number", () => {
    const out = new Array<number>(BAR_COUNT).fill(1)
    barTargets(spectrum(1024, () => 0), BAR_COUNT, out)
    expect(out.every((v) => v === 0)).toBe(true)
    barTargets([], BAR_COUNT, out)
    expect(out.every((v) => v === 0)).toBe(true)
    barTargets([Number.NaN, Number.POSITIVE_INFINITY, 12], BAR_COUNT, out)
    expect(out.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true)
  })

  it("fills exactly the bars it is given, every one between 0 and 1", () => {
    for (const count of [5, 24, 32]) {
      const out = new Array<number>(count).fill(-1)
      barTargets(spectrum(1024, () => 255), count, out)
      expect(out).toHaveLength(count)
      expect(out.every((v) => v >= 0 && v <= 1)).toBe(true)
    }
  })

  it("is mirrored around the middle, so the voice reads as one symmetric shape", () => {
    const out = new Array<number>(BAR_COUNT).fill(0)
    barTargets(spectrum(1024, (bin) => (bin * 7) % 256), BAR_COUNT, out)
    for (let i = 0; i < BAR_COUNT; i++) expect(out[i]).toBeCloseTo(out[BAR_COUNT - 1 - i], 6)
  })

  it("puts the low frequencies in the middle and the high ones at the edges", () => {
    const low = new Array<number>(BAR_COUNT).fill(0)
    barTargets(spectrum(1024, (bin) => (bin < 8 ? 255 : 0)), BAR_COUNT, low)
    const middle = low[BAR_COUNT / 2 - 1]
    expect(middle).toBeGreaterThan(0.5)
    expect(low[0]).toBe(0)

    const high = new Array<number>(BAR_COUNT).fill(0)
    barTargets(spectrum(1024, (bin) => (bin > 150 && bin < 260 ? 255 : 0)), BAR_COUNT, high)
    expect(high[0]).toBeGreaterThan(0.5)
    expect(high[BAR_COUNT / 2 - 1]).toBe(0)
  })

  it("lets a louder spectrum move the bars further", () => {
    const quiet = new Array<number>(BAR_COUNT).fill(0)
    const loud = new Array<number>(BAR_COUNT).fill(0)
    barTargets(spectrum(1024, () => 60), BAR_COUNT, quiet)
    barTargets(spectrum(1024, () => 200), BAR_COUNT, loud)
    expect(quiet.every((v, i) => v <= loud[i])).toBe(true)
    expect(Math.max(...loud)).toBeGreaterThan(Math.max(...quiet))
  })
})

describe("stepBars", () => {
  it("rises toward the targets without passing them", () => {
    const heights = [0, 0, 0]
    stepBars(heights, [1, 0.5, 0], 16)
    expect(heights[0]).toBeGreaterThan(0)
    expect(heights[0]).toBeLessThan(1)
    expect(heights[1]).toBeGreaterThan(0)
    expect(heights[1]).toBeLessThan(0.5)
    expect(heights[2]).toBe(0)
    for (let i = 0; i < 200; i++) stepBars(heights, [1, 0.5, 0], 16)
    expect(heights[0]).toBeLessThanOrEqual(1)
    expect(heights[0]).toBeGreaterThan(0.99)
  })

  it("rises faster than it falls: a beat pops, then lingers", () => {
    const up = [0]
    stepBars(up, [1], 40)
    const down = [1]
    stepBars(down, [0], 40)
    expect(up[0]).toBeGreaterThan(1 - down[0])
  })

  it("says whether anything is still moving, and snaps a faded bar to rest", () => {
    const heights = [0.4, 0.2]
    expect(stepBars(heights, [0, 0], 16)).toBe(true)
    let moving = true
    for (let i = 0; i < 400 && moving; i++) moving = stepBars(heights, [0, 0], 16)
    expect(moving).toBe(false)
    expect(heights).toEqual([0, 0])
    expect(stepBars(heights, [0, 0], 16)).toBe(false)
  })

  it("does not move without time", () => {
    const heights = [0.3]
    stepBars(heights, [1], 0)
    expect(heights[0]).toBe(0.3)
  })
})

describe("barScale", () => {
  it("keeps a calm baseline at rest and fills the bar at full level", () => {
    expect(barScale(0)).toBe(BAR_REST)
    expect(barScale(1)).toBe(1)
    expect(barScale(0.5)).toBeGreaterThan(BAR_REST)
    expect(barScale(0.5)).toBeLessThan(1)
  })

  it("never leaves the baseline-to-full range, whatever it is given", () => {
    expect(barScale(-3)).toBe(BAR_REST)
    expect(barScale(9)).toBe(1)
    expect(barScale(Number.NaN)).toBe(BAR_REST)
  })
})
