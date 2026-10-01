import { describe, expect, it } from "vitest"
import {
  ORB_EXIT_MS,
  ORB_RETURN_EXIT_MS,
  ORB_RETURN_FADE_MS,
  ORB_RETURN_MS,
  ORB_RETURN_REDUCED_MS,
  ORB_WARP_MS,
} from "./portal-timing"

describe("portal timing", () => {
  it("keeps the way in as it was: 1.7 s of tunnel, then a 1.3 s linger", () => {
    expect(ORB_WARP_MS).toBe(1700)
    expect(ORB_EXIT_MS).toBe(1300)
  })

  it("runs the way back at about half the outbound trip", () => {
    expect(ORB_RETURN_MS / ORB_WARP_MS).toBeGreaterThan(0.4)
    expect(ORB_RETURN_MS / ORB_WARP_MS).toBeLessThan(0.6)
    expect(ORB_RETURN_EXIT_MS / ORB_EXIT_MS).toBeGreaterThan(0.3)
    expect(ORB_RETURN_EXIT_MS / ORB_EXIT_MS).toBeLessThan(0.6)
    expect(ORB_RETURN_MS + ORB_RETURN_EXIT_MS).toBeLessThan((ORB_WARP_MS + ORB_EXIT_MS) * 0.6)
  })

  it("finishes fading the tunnel before it lets the layer go, so nothing pops", () => {
    expect(ORB_RETURN_FADE_MS).toBeLessThanOrEqual(ORB_RETURN_EXIT_MS)
  })

  it("makes the reduced-motion return a short crossfade, shorter than the tunnel", () => {
    expect(ORB_RETURN_REDUCED_MS).toBeGreaterThan(100)
    expect(ORB_RETURN_REDUCED_MS).toBeLessThan(ORB_RETURN_MS / 2)
  })
})
