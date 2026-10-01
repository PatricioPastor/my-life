import { describe, expect, it } from "vitest"
import { exactCoordinate, isApproximatePosition, isValidPosition, roundCoordinate } from "./coordinates"

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

describe("exactCoordinate", () => {
  it.each([
    [40.712812345, 40.712812],
    [-74.006009876, -74.00601],
    [12.3456785, 12.345679],
    [-12.3456785, -12.345679],
    [1.005, 1.005],
    [12, 12],
  ])("trims %s to %s (6 decimals, the column precision)", (input, expected) => {
    expect(exactCoordinate(input)).toBe(expected)
  })

  it("never returns negative zero", () => {
    expect(Object.is(exactCoordinate(-0.0000001), 0)).toBe(true)
  })
})

describe("isValidPosition", () => {
  it("accepts any finite position inside the globe, at any precision", () => {
    expect(isValidPosition(-34.593712, -58.421589)).toBe(true)
    expect(isValidPosition(90, 180)).toBe(true)
    expect(isValidPosition(-90, -180)).toBe(true)
  })

  it.each([
    ["latitude out of range", 90.000001, 10],
    ["longitude out of range", 10, -180.000001],
    ["the 0,0 no-fix position", 0, 0],
    ["NaN", Number.NaN, 1],
    ["Infinity", 1, Number.POSITIVE_INFINITY],
  ])("rejects %s", (_label, lat, lng) => {
    expect(isValidPosition(lat, lng)).toBe(false)
  })

  it.each([["12"], [null], [undefined], [{}]])("rejects a non-number (%s)", (value) => {
    expect(isValidPosition(value, 1)).toBe(false)
    expect(isValidPosition(1, value)).toBe(false)
  })
})
