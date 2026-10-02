import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { readMaxAudioBytes } from "./max-audio-bytes"
import { ABSOLUTE_MAX_AUDIO_BYTES, MAX_AUDIO_BYTES } from "./upload-limits"

describe("readMaxAudioBytes", () => {
  it("defaults to the plan maximum when the variable is not set", () => {
    expect(readMaxAudioBytes({})).toBe(MAX_AUDIO_BYTES)
    expect(readMaxAudioBytes({ MEMORY_MAX_AUDIO_BYTES: "" })).toBe(MAX_AUDIO_BYTES)
    expect(readMaxAudioBytes({ MEMORY_MAX_AUDIO_BYTES: "   " })).toBe(MAX_AUDIO_BYTES)
  })

  it("takes a whole number of bytes, trimmed", () => {
    expect(readMaxAudioBytes({ MEMORY_MAX_AUDIO_BYTES: "250000000" })).toBe(250_000_000)
    expect(readMaxAudioBytes({ MEMORY_MAX_AUDIO_BYTES: " 50000000 " })).toBe(50_000_000)
  })

  it.each(["abc", "-5", "0", "1.5", "1e9", "12 MB", "0x10", "NaN", "Infinity"])("ignores %s and keeps the default", (value) => {
    expect(readMaxAudioBytes({ MEMORY_MAX_AUDIO_BYTES: value })).toBe(MAX_AUDIO_BYTES)
  })

  it("never goes above the ceiling the database accepts", () => {
    expect(readMaxAudioBytes({ MEMORY_MAX_AUDIO_BYTES: String(ABSOLUTE_MAX_AUDIO_BYTES) })).toBe(ABSOLUTE_MAX_AUDIO_BYTES)
    expect(readMaxAudioBytes({ MEMORY_MAX_AUDIO_BYTES: String(ABSOLUTE_MAX_AUDIO_BYTES + 1) })).toBe(ABSOLUTE_MAX_AUDIO_BYTES)
    expect(readMaxAudioBytes({ MEMORY_MAX_AUDIO_BYTES: "99999999999999999999" })).toBe(ABSOLUTE_MAX_AUDIO_BYTES)
  })

  it("refuses a cap too small to hold any audio", () => {
    expect(readMaxAudioBytes({ MEMORY_MAX_AUDIO_BYTES: "100" })).toBe(MAX_AUDIO_BYTES)
  })
})
