import { describe, expect, it } from "vitest"
import { resolveSkyParams } from "@/features/sky"
import { themeVars } from "./theme"

describe("themeVars", () => {
  it("derives the ink and accent tokens from the sky preset", () => {
    const vars = themeVars(resolveSkyParams("crimson")) as Record<string, string>
    expect(vars["--void"]).toBe("#050309")
    expect(vars["--ink"]).toBe("#f6e2e8")
    expect(vars["--signal"]).toBe("#ff1f5a")
    expect(vars["--ink-muted"]).toBe("rgba(246, 226, 232, 0.68)")
    expect(vars["--ink-faint"]).toBe("rgba(246, 226, 232, 0.24)")
    expect(vars["--ink-dim"]).toBe("rgba(246, 226, 232, 0.28)")
    expect(vars["--scrim"]).toBe("rgba(5, 3, 9, 0.86)")
  })

  it("follows the preset", () => {
    const vars = themeVars(resolveSkyParams("phosphor")) as Record<string, string>
    expect(vars["--signal"]).toBe("#6dff7a")
  })
})
