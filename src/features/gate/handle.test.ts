import { describe, expect, it } from "vitest"
import { isValidHandle, normalizeHandle } from "./handle"

describe("normalizeHandle", () => {
  it("strips leading @ signs", () => {
    expect(normalizeHandle("@@ana")).toBe("ana")
  })

  it("strips an @ that follows leading whitespace", () => {
    expect(normalizeHandle("  @ana")).toBe("ana")
  })

  it("keeps an @ that is not leading", () => {
    expect(normalizeHandle("a@b")).toBe("a@b")
  })

  it("removes all whitespace", () => {
    expect(normalizeHandle("  a n\tb\n")).toBe("anb")
  })

  it("lowercases", () => {
    expect(normalizeHandle("Ana_R")).toBe("ana_r")
  })

  it("caps the length at 30", () => {
    expect(normalizeHandle("a".repeat(40))).toBe("a".repeat(30))
  })

  it("tolerates non-string input", () => {
    expect(normalizeHandle(undefined as unknown as string)).toBe("")
  })
})

describe("isValidHandle", () => {
  it("accepts letters, digits, periods and underscores", () => {
    expect(isValidHandle("ana.r_99")).toBe(true)
  })

  it("rejects empty", () => {
    expect(isValidHandle("")).toBe(false)
  })

  it("rejects other characters", () => {
    expect(isValidHandle("ana-r")).toBe(false)
    expect(isValidHandle("ana!")).toBe(false)
  })

  it("rejects uppercase (callers normalize first)", () => {
    expect(isValidHandle("Ana")).toBe(false)
  })

  it("rejects more than 30 characters", () => {
    expect(isValidHandle("a".repeat(30))).toBe(true)
    expect(isValidHandle("a".repeat(31))).toBe(false)
  })
})
