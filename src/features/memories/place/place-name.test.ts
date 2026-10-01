import { describe, expect, it } from "vitest"
import { PLACE_NAME_MAX_LENGTH, cleanPlaceName } from "./place-name"

describe("cleanPlaceName", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanPlaceName("  Palermo,   Buenos Aires ")).toBe("Palermo, Buenos Aires")
  })

  it("strips control characters", () => {
    expect(cleanPlaceName("Pale\u0000rmo\u001f")).toBe("Palermo")
  })

  it("returns null for empty or non-string input", () => {
    expect(cleanPlaceName("   ")).toBeNull()
    expect(cleanPlaceName(null)).toBeNull()
    expect(cleanPlaceName(42)).toBeNull()
  })

  it("caps the length at 120 characters, counting code points", () => {
    expect(PLACE_NAME_MAX_LENGTH).toBe(120)
    const out = cleanPlaceName("🌎".repeat(200))!
    expect([...out]).toHaveLength(120)
  })
})
