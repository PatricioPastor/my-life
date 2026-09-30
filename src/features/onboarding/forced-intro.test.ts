import { describe, expect, it } from "vitest"
import { forcedIntro } from "./forced-intro"

describe("forcedIntro", () => {
  it("forces the intro for ?intro and ?intro=1", () => {
    expect(forcedIntro("?intro")).toBe(true)
    expect(forcedIntro("?intro=1")).toBe(true)
    expect(forcedIntro("?utm=x&intro")).toBe(true)
    expect(forcedIntro("intro=1")).toBe(true)
  })

  it("does nothing without the param, or when it is switched off", () => {
    expect(forcedIntro("")).toBe(false)
    expect(forcedIntro("?")).toBe(false)
    expect(forcedIntro("?other=1")).toBe(false)
    expect(forcedIntro("?introduction")).toBe(false)
    expect(forcedIntro("?intro=0")).toBe(false)
    expect(forcedIntro("?intro=false")).toBe(false)
  })
})
