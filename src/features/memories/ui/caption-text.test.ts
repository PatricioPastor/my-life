import { describe, expect, it } from "vitest"
import { CAPTION_MAX_LENGTH } from "../memory"
import { CAPTION_TIERS, captionTier } from "./caption-text"

describe("captionTier", () => {
  it("keeps a short caption large", () => {
    expect(captionTier("Una tarde de lluvia")).toBe("lg")
    expect(captionTier("x".repeat(CAPTION_TIERS.lg))).toBe("lg")
  })

  it("steps down one size for a medium caption", () => {
    expect(captionTier("x".repeat(CAPTION_TIERS.lg + 1))).toBe("md")
    expect(captionTier("x".repeat(CAPTION_TIERS.md))).toBe("md")
  })

  it("steps down again for a long one, up to the longest a caption can be", () => {
    expect(captionTier("x".repeat(CAPTION_TIERS.md + 1))).toBe("sm")
    expect(captionTier("x".repeat(CAPTION_MAX_LENGTH))).toBe("sm")
  })

  it("counts letters, not the spaces around them", () => {
    expect(captionTier(`   ${"x".repeat(CAPTION_TIERS.lg)}   `)).toBe("lg")
  })

  it("keeps its limits inside what a caption can be", () => {
    expect(CAPTION_TIERS.lg).toBeLessThan(CAPTION_TIERS.md)
    expect(CAPTION_TIERS.md).toBeLessThan(CAPTION_MAX_LENGTH)
  })
})
