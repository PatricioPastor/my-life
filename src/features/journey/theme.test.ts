import { describe, expect, it } from "vitest"
import { resolveSkyParams } from "@/features/sky"
import { themeVars } from "./theme"

describe("themeVars", () => {
  it("maps void to the portal background and ink to Porcelain, with ink alphas", () => {
    const vars = themeVars(resolveSkyParams("ember")) as Record<string, string>
    expect(vars["--void"]).toBe("#0A0600")
    expect(vars["--ink"]).toBe("#FBFEF9")
    expect(vars["--ink-muted"]).toBe("rgba(251, 254, 249, 0.68)")
    expect(vars["--ink-faint"]).toBe("rgba(251, 254, 249, 0.24)")
    expect(vars["--ink-dim"]).toBe("rgba(251, 254, 249, 0.28)")
    expect(vars["--scrim"]).toBe("rgba(10, 6, 0, 0.86)")
  })

  it("keeps signal on School Bus Yellow, decoupled from the sky's hot color", () => {
    const ember = themeVars(resolveSkyParams("ember")) as Record<string, string>
    expect(ember["--signal"]).toBe("#FFC600")
    expect(ember["--signal"]).not.toBe(resolveSkyParams("ember").hotColor)
    const phosphor = themeVars(resolveSkyParams("phosphor")) as Record<string, string>
    expect(phosphor["--signal"]).toBe("#FFC600")
  })
})
