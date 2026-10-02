import { describe, expect, it } from "vitest"
import { CHUNK_SIZE, CHUNK_THRESHOLD_BYTES, MIN_CHUNK_BYTES, needsChunking, planChunks } from "./chunk-plan"

describe("chunk sizes", () => {
  it("uses chunks above Cloudinary's 5 MB minimum (6 MB, as its own examples do)", () => {
    expect(MIN_CHUNK_BYTES).toBe(5_000_000)
    expect(CHUNK_SIZE).toBe(6_000_000)
    expect(CHUNK_SIZE).toBeGreaterThan(MIN_CHUNK_BYTES)
  })

  it("sends a file in chunks from about 20 MB, well under the 100 MB where Cloudinary requires it", () => {
    expect(CHUNK_THRESHOLD_BYTES).toBe(20_000_000)
    expect(needsChunking(CHUNK_THRESHOLD_BYTES)).toBe(false)
    expect(needsChunking(CHUNK_THRESHOLD_BYTES + 1)).toBe(true)
    expect(needsChunking(1)).toBe(false)
  })
})

describe("planChunks", () => {
  it("covers the file exactly, with inclusive byte ranges that name the total (Content-Range)", () => {
    const plan = planChunks(22_744_222, 6_000_000)
    expect(plan.map((c) => c.contentRange)).toEqual([
      "bytes 0-5999999/22744222",
      "bytes 6000000-11999999/22744222",
      "bytes 12000000-17999999/22744222",
      "bytes 18000000-22744221/22744222",
    ])
    expect(plan.map((c) => c.size)).toEqual([6_000_000, 6_000_000, 6_000_000, 4_744_222])
    expect(plan.map((c) => c.index)).toEqual([0, 1, 2, 3])
  })

  it("gives every chunk but the last at least the minimum, whatever the total", () => {
    for (const total of [20_000_001, 33_333_333, 100_000_000, 6_000_001, 5_999_999]) {
      const plan = planChunks(total)
      for (const chunk of plan.slice(0, -1)) expect(chunk.size).toBeGreaterThan(MIN_CHUNK_BYTES)
      expect(plan.reduce((sum, c) => sum + c.size, 0)).toBe(total)
      expect(plan[0].start).toBe(0)
      expect(plan.at(-1)!.end).toBe(total - 1)
      plan.forEach((c, i) => i > 0 && expect(c.start).toBe(plan[i - 1].end + 1))
    }
  })

  it("makes one chunk of a file smaller than a chunk, and of exactly one chunk", () => {
    expect(planChunks(1000, 6_000_000)).toEqual([{ index: 0, start: 0, end: 999, size: 1000, contentRange: "bytes 0-999/1000" }])
    expect(planChunks(6_000_000)).toHaveLength(1)
    expect(planChunks(6_000_001)).toHaveLength(2)
  })

  it("plans 17 chunks of 6 MB for the largest file of the default cap", () => {
    expect(planChunks(100_000_000)).toHaveLength(17)
  })

  it("refuses an empty file and a chunk size below the minimum", () => {
    expect(() => planChunks(0)).toThrow()
    expect(() => planChunks(-5)).toThrow()
    expect(() => planChunks(1.5)).toThrow()
    expect(() => planChunks(10_000_000, MIN_CHUNK_BYTES)).toThrow()
    expect(() => planChunks(10_000_000, 1000)).toThrow()
  })
})
