import { describe, expect, it } from "vitest"
import { formatMemoryDate, truncateCaption } from "./format"

describe("formatMemoryDate", () => {
  it("formats an ISO date in Spanish", () => {
    expect(formatMemoryDate("2024-03-12")).toBe("12 de marzo de 2024")
  })

  it("reads the calendar date in UTC, whatever the local zone", () => {
    expect(formatMemoryDate("2024-01-01T00:00:00.000Z")).toBe("1 de enero de 2024")
    expect(formatMemoryDate("2024-12-31T00:00:00.000Z")).toBe("31 de diciembre de 2024")
  })
})

describe("truncateCaption", () => {
  it("keeps short captions", () => {
    expect(truncateCaption("Una tarde", 28)).toBe("Una tarde")
  })

  it("cuts at a word boundary and adds an ellipsis", () => {
    expect(truncateCaption("Una tarde de lluvia en la costa del sur", 20)).toBe("Una tarde de lluvia…")
  })

  it("hard-cuts a single long word", () => {
    expect(truncateCaption("abcdefghijklmnopqrstuvwxyz", 10)).toBe("abcdefghi…")
  })

  it("collapses whitespace", () => {
    expect(truncateCaption("  uno \n  dos  ", 28)).toBe("uno dos")
  })
})
