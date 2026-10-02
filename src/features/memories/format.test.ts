import { describe, expect, it } from "vitest"
import { formatMemoryDate, formatMemoryWhen, truncateCaption } from "./format"

describe("formatMemoryDate", () => {
  it("formats an ISO date in Spanish", () => {
    expect(formatMemoryDate("2024-03-12")).toBe("12 de marzo de 2024")
  })

  it("reads the calendar date in UTC, whatever the local zone", () => {
    expect(formatMemoryDate("2024-01-01T00:00:00.000Z")).toBe("1 de enero de 2024")
    expect(formatMemoryDate("2024-12-31T00:00:00.000Z")).toBe("31 de diciembre de 2024")
  })
})

describe("formatMemoryWhen", () => {
  it("adds the time after the date when it is known", () => {
    expect(formatMemoryWhen("2024-03-14", "18:42")).toBe("14 de marzo de 2024 · 18:42")
  })

  it("keeps the wall-clock time as it was written: no time zone moves it", () => {
    expect(formatMemoryWhen("2024-12-31", "23:59")).toBe("31 de diciembre de 2024 · 23:59")
    expect(formatMemoryWhen("2024-01-01", "00:00")).toBe("1 de enero de 2024 · 00:00")
  })

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["something that is not a time", "18h42"],
  ])("is only the date when the time is %s", (_name, time) => {
    expect(formatMemoryWhen("2024-03-12", time as string | null | undefined)).toBe("12 de marzo de 2024")
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
