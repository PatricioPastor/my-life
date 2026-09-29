import { describe, expect, it } from "vitest"
import { cn } from "./utils"

describe("cn", () => {
  it("joins truthy class names and drops falsy ones", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c")
  })

  it("lets the last conflicting Tailwind utility win", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4")
  })
})
