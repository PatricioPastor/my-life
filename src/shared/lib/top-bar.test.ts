import { describe, expect, it } from "vitest"
import { BAR_LEFT, BAR_RIGHT, BAR_TOP } from "./top-bar"

describe("the top bar", () => {
  it("sits under the status bar and the notch, closer to the edge on a phone than on a desktop", () => {
    expect(BAR_TOP).toContain("env(safe-area-inset-top)")
    expect(BAR_TOP).toMatch(/md:top-\[/)
  })

  it("keeps clear of a side notch on both sides", () => {
    expect(BAR_LEFT).toContain("env(safe-area-inset-left)")
    expect(BAR_RIGHT).toContain("env(safe-area-inset-right)")
  })

  it("is one class per edge, so every control of the bar can share it", () => {
    for (const edge of [BAR_TOP, BAR_LEFT, BAR_RIGHT]) expect(edge).not.toMatch(/\s(?!md:)/)
  })
})
