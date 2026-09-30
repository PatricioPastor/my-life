import { describe, expect, it } from "vitest"
import { resolveSkyParams } from "@/features/sky"
import { themeVars } from "./theme"

describe("themeVars", () => {
  it("maps void and ink to Shadow Grey and Porcelain, with ink alphas", () => {
    const vars = themeVars(resolveSkyParams("periwinkle")) as Record<string, string>
    expect(vars["--void"]).toBe("#191923")
    expect(vars["--ink"]).toBe("#FBFEF9")
    expect(vars["--ink-muted"]).toBe("rgba(251, 254, 249, 0.68)")
    expect(vars["--ink-faint"]).toBe("rgba(251, 254, 249, 0.24)")
    expect(vars["--ink-dim"]).toBe("rgba(251, 254, 249, 0.28)")
    expect(vars["--scrim"]).toBe("rgba(25, 25, 35, 0.86)")
  })

  it("keeps signal on School Bus Yellow, decoupled from the sky's hot color", () => {
    const periwinkle = themeVars(resolveSkyParams("periwinkle")) as Record<string, string>
    expect(periwinkle["--signal"]).toBe("#FFC600")
    expect(periwinkle["--signal"]).not.toBe(resolveSkyParams("periwinkle").hotColor)
    const phosphor = themeVars(resolveSkyParams("phosphor")) as Record<string, string>
    expect(phosphor["--signal"]).toBe("#FFC600")
  })
})
