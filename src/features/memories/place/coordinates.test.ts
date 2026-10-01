import { describe, expect, it } from "vitest"
import { isApproximatePosition, roundCoordinate } from "./coordinates"

describe("roundCoordinate", () => {
  it.each([
    [-34.5937, -34.59],
    [-58.4251, -58.43],
    [1.005, 1.01],
    [-1.005, -1.01],
    [0.004, 0],
    [12, 12],
  ])("rounds %s to %s", (input, expected) => {
    expect(roundCoordinate(input)).toBe(expected)
  })

  it("never returns negative zero", () => {
    expect(Object.is(roundCoordinate(-0.001), 0)).toBe(true)
  })
})

describe("isApproximatePosition", () => {
  it("accepts a position already rounded to 2 decimals", () => {
    expect(isApproximatePosition(-34.59, -58.42)).toBe(true)
    expect(isApproximatePosition(90, 180)).toBe(true)
  })

  it.each([
    ["more than 2 decimals", -34.591, -58.42],
    ["latitude out of range", 90.01, 10],
    ["longitude out of range", 10, -180.01],
    ["the 0,0 no-fix position", 0, 0],
    ["NaN", Number.NaN, 1],
    ["Infinity", 1, Number.POSITIVE_INFINITY],
  ])("rejects %s", (_label, lat, lng) => {
    expect(isApproximatePosition(lat, lng)).toBe(false)
  })

  it.each([["12"], [null], [undefined], [{}]])("rejects a non-number (%s)", (value) => {
    expect(isApproximatePosition(value as never, 1)).toBe(false)
    expect(isApproximatePosition(1, value as never)).toBe(false)
  })
})
