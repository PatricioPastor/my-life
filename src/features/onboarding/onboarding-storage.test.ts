import { afterEach, describe, expect, it, vi } from "vitest"
import { markSeen, readSeen } from "./onboarding-storage"

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe("onboarding storage", () => {
  it("remembers a finished onboarding", () => {
    expect(readSeen()).toBe(false)
    markSeen()
    expect(readSeen()).toBe(true)
  })

  it("never throws when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    expect(readSeen()).toBe(false)
    expect(() => markSeen()).not.toThrow()
  })
})
