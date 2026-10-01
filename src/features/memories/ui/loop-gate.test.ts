import { describe, expect, it } from "vitest"
import { loopShouldRun } from "./loop-gate"

const base = { alive: true, reduced: false, hidden: false, paused: false }

describe("loopShouldRun", () => {
  it("runs when alive, in motion, visible and not paused", () => {
    expect(loopShouldRun(base)).toBe(true)
  })

  it("idles while paused (the glass view is open over it)", () => {
    expect(loopShouldRun({ ...base, paused: true })).toBe(false)
  })

  it("idles when the page is hidden, reduced, or disposed", () => {
    expect(loopShouldRun({ ...base, hidden: true })).toBe(false)
    expect(loopShouldRun({ ...base, reduced: true })).toBe(false)
    expect(loopShouldRun({ ...base, alive: false })).toBe(false)
  })
})
