import { describe, expect, it } from "vitest"
import { formatViewCount } from "./view-count"

describe("formatViewCount", () => {
  it("says nothing at zero, so a memory nobody opened shows no count", () => {
    expect(formatViewCount(0)).toBeNull()
  })

  it("is singular for one", () => {
    expect(formatViewCount(1)).toBe("1 vista")
  })

  it("is plural for two or more", () => {
    expect(formatViewCount(2)).toBe("2 vistas")
    expect(formatViewCount(12)).toBe("12 vistas")
  })

  it("groups thousands the Spanish way (a dot, from five digits)", () => {
    expect(formatViewCount(12_345)).toBe("12.345 vistas")
    expect(formatViewCount(1_234_567)).toBe("1.234.567 vistas")
  })

  it("says nothing for a count that cannot be one", () => {
    for (const bad of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(formatViewCount(bad), String(bad)).toBeNull()
  })
})
