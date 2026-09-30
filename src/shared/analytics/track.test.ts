import { afterEach, describe, expect, it, vi } from "vitest"

const vercelTrack = vi.fn()
const sendGAEvent = vi.fn()
vi.mock("@vercel/analytics", () => ({ track: (...a: unknown[]) => vercelTrack(...a) }))
vi.mock("@next/third-parties/google", () => ({ sendGAEvent: (...a: unknown[]) => sendGAEvent(...a) }))

import { track } from "./track"

afterEach(() => {
  vi.unstubAllEnvs()
  vercelTrack.mockReset()
  sendGAEvent.mockReset()
})

describe("track", () => {
  it("sends the sanitized event to Vercel and skips GA when it is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_ID", "")
    track("facet_opened", { facet: "now", handle: "ana" } as never)
    expect(vercelTrack).toHaveBeenCalledWith("facet_opened", { facet: "now" })
    expect(sendGAEvent).not.toHaveBeenCalled()
  })

  it("also sends to GA when configured", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_ID", "G-TEST")
    track("gate_granted")
    expect(sendGAEvent).toHaveBeenCalledWith("event", "gate_granted", {})
  })

  it("never throws when a provider does", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_ID", "G-TEST")
    vercelTrack.mockImplementation(() => {
      throw new Error("blocked")
    })
    expect(() => track("gate_denied")).not.toThrow()
    expect(sendGAEvent).toHaveBeenCalled()
  })
})
