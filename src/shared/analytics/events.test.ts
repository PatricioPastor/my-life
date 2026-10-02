import { describe, expect, it } from "vitest"
import { FACETS } from "@/features/facets"
import { FACET_IDS, sanitizeProps } from "./events"

describe("sanitizeProps", () => {
  it("keeps only the allow-listed keys of an event", () => {
    expect(sanitizeProps("entry_opened", { facet: "now", index: 2, handle: "ana", note: "hi" })).toEqual({
      facet: "now",
      index: 2,
    })
  })

  it("drops every prop from events that carry none", () => {
    for (const name of ["gate_submitted", "gate_granted", "gate_denied", "access_requested", "onboarding_completed", "onboarding_skipped", "hw_accel_suggested", "intro_replayed", "story_completed", "memory_orb_opened", "memory_orb_summoned", "memory_submitted", "memory_audio_recorded"] as const) {
      expect(sanitizeProps(name, { handle: "ana", facet: "now" })).toEqual({})
    }
  })

  it("records the orb being opened with no props at all", () => {
    expect(sanitizeProps("memory_orb_opened", {})).toEqual({})
    expect(sanitizeProps("memory_orb_opened", { handle: "ana", x: 0.4, facet: "now" })).toEqual({})
  })

  it("records the orb being summoned with no props at all", () => {
    expect(sanitizeProps("memory_orb_summoned", {})).toEqual({})
    expect(sanitizeProps("memory_orb_summoned", { x: 120, y: 300, key: "r", handle: "ana" })).toEqual({})
  })

  it("records a submitted memory with no props: never the caption, the date or the handle", () => {
    expect(sanitizeProps("memory_submitted", {})).toEqual({})
    expect(sanitizeProps("memory_submitted", { caption: "Una tarde", handle: "ana", date: "2024-03-12" })).toEqual({})
  })

  it("never lets a handle or free text through the facet slot", () => {
    expect(sanitizeProps("facet_opened", { facet: "ana.b" })).toEqual({})
    expect(sanitizeProps("facet_opened", { facet: "@ana" })).toEqual({})
    expect(sanitizeProps("entry_opened", { facet: "now", index: "ana" })).toEqual({ facet: "now" })
  })

  it("accepts only whole, small entry indexes", () => {
    expect(sanitizeProps("entry_opened", { facet: "now", index: 1.5 })).toEqual({ facet: "now" })
    expect(sanitizeProps("entry_opened", { facet: "now", index: -1 })).toEqual({ facet: "now" })
  })

  it("knows exactly the facets the site has", () => {
    expect([...FACET_IDS].sort()).toEqual(FACETS.map((f) => f.id).sort())
  })
})

describe("memory_audio_recorded", () => {
  it("is recorded with no props: never the audio, its length or the handle", () => {
    expect(sanitizeProps("memory_audio_recorded", {})).toEqual({})
    expect(sanitizeProps("memory_audio_recorded", { durationMs: 4200, handle: "ana", url: "blob:x" })).toEqual({})
  })
})

describe("sharing events", () => {
  it.each(["memory_shared", "shared_memory_opened"] as const)("records %s with no props: never the token, the memory or the url", (name) => {
    expect(sanitizeProps(name, {})).toEqual({})
    expect(sanitizeProps(name, { token: "abc.def", id: "11111111-1111-4111-8111-111111111111", url: "https://x/m/abc", handle: "ana" })).toEqual({})
  })
})
