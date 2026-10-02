import { describe, expect, it } from "vitest"
import { validateNewMemory } from "./validate-new-memory"
import type { NewMemoryInput } from "./memory"

const NOW = new Date("2026-10-01T15:30:00.000Z")

function input(overrides: Partial<NewMemoryInput> = {}): NewMemoryInput {
  return {
    publicId: "memories/abc123",
    caption: "A night on the roof",
    happenedOn: new Date("2024-06-15T00:00:00.000Z"),
    happenedTime: null,
    width: 1200,
    height: 800,
    audio: null,
    ...overrides,
  }
}

function errorsOf(overrides: Partial<NewMemoryInput>) {
  const result = validateNewMemory(input(overrides), NOW)
  return result.ok ? [] : result.errors
}

describe("validateNewMemory", () => {
  it("accepts a valid memory and returns it normalized", () => {
    const result = validateNewMemory(input({ caption: "  hello  " }), NOW)
    expect(result).toEqual({
      ok: true,
      value: { ...input(), caption: "hello" },
    })
  })

  describe("caption", () => {
    it("rejects an empty caption", () => {
      expect(errorsOf({ caption: "" })).toEqual(["caption_empty"])
    })

    it("rejects a whitespace-only caption", () => {
      expect(errorsOf({ caption: "   \n\t " })).toEqual(["caption_empty"])
    })

    it("accepts exactly 140 characters", () => {
      expect(errorsOf({ caption: "a".repeat(140) })).toEqual([])
    })

    it("rejects 141 characters", () => {
      expect(errorsOf({ caption: "a".repeat(141) })).toEqual(["caption_too_long"])
    })

    it("measures the trimmed caption", () => {
      expect(errorsOf({ caption: ` ${"a".repeat(140)} ` })).toEqual([])
    })

    it("counts characters, not UTF-16 units", () => {
      expect(errorsOf({ caption: "🔥".repeat(140) })).toEqual([])
      expect(errorsOf({ caption: "🔥".repeat(141) })).toEqual(["caption_too_long"])
    })
  })

  describe("happenedOn", () => {
    it("rejects an invalid date", () => {
      expect(errorsOf({ happenedOn: new Date("nope") })).toEqual(["date_invalid"])
    })

    it("accepts today", () => {
      expect(errorsOf({ happenedOn: new Date("2026-10-01T00:00:00.000Z") })).toEqual([])
    })

    it("accepts today even with a time later than now", () => {
      expect(errorsOf({ happenedOn: new Date("2026-10-01T23:59:59.000Z") })).toEqual([])
    })

    it("rejects tomorrow", () => {
      expect(errorsOf({ happenedOn: new Date("2026-10-02T00:00:00.000Z") })).toEqual([
        "date_in_future",
      ])
    })

    it("accepts 1900-01-01", () => {
      expect(errorsOf({ happenedOn: new Date("1900-01-01T00:00:00.000Z") })).toEqual([])
    })

    it("rejects 1899-12-31", () => {
      expect(errorsOf({ happenedOn: new Date("1899-12-31T00:00:00.000Z") })).toEqual([
        "date_too_old",
      ])
    })

    it("normalizes the stored date to UTC midnight", () => {
      const result = validateNewMemory(
        input({ happenedOn: new Date("2024-06-15T18:45:00.000Z") }),
        NOW,
      )
      expect(result.ok && result.value.happenedOn.toISOString()).toBe("2024-06-15T00:00:00.000Z")
    })
  })

  describe("happenedTime", () => {
    it.each(["00:00", "07:05", "18:42", "23:59"])("accepts the wall-clock time %s and keeps it as it is", (happenedTime) => {
      const result = validateNewMemory(input({ happenedTime }), NOW)
      expect(result.ok && result.value.happenedTime).toBe(happenedTime)
    })

    it.each([
      ["null", null],
      ["undefined", undefined],
      ["an empty string", ""],
    ])("treats %s as no time", (_name, happenedTime) => {
      const result = validateNewMemory(input({ happenedTime }), NOW)
      expect(result.ok && result.value.happenedTime).toBeNull()
    })

    it.each([
      ["24:00", "24:00"],
      ["12:60", "12:60"],
      ["a single-digit hour", "7:05"],
      ["seconds", "18:42:00"],
      ["no colon", "1842"],
      ["letters", "aa:bb"],
      ["spaces", " 18:42"],
      ["a number", 1842],
      ["an object", { hour: 18 }],
    ])("rejects %s", (_name, happenedTime) => {
      expect(errorsOf({ happenedTime })).toEqual(["time_invalid"])
    })

    it("leaves the date rules as they are: a time never makes a future date pass, or today fail", () => {
      expect(errorsOf({ happenedOn: new Date("2026-10-02T00:00:00.000Z"), happenedTime: "00:00" })).toEqual(["date_in_future"])
      expect(errorsOf({ happenedOn: new Date("2026-10-01T00:00:00.000Z"), happenedTime: "23:59" })).toEqual([])
    })
  })

  describe("dimensions", () => {
    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects width %s", (width) => {
      expect(errorsOf({ width })).toEqual(["width_invalid"])
    })

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects height %s", (height) => {
      expect(errorsOf({ height })).toEqual(["height_invalid"])
    })

    it("accepts 1 as the smallest dimension", () => {
      expect(errorsOf({ width: 1, height: 1 })).toEqual([])
    })
  })

  describe("publicId", () => {
    it("rejects an empty id", () => {
      expect(errorsOf({ publicId: "" })).toEqual(["public_id_empty"])
    })

    it("rejects a whitespace-only id", () => {
      expect(errorsOf({ publicId: "  " })).toEqual(["public_id_empty"])
    })
  })

  it("reports every failing field at once", () => {
    expect(errorsOf({ caption: "", width: 0, height: 0, publicId: "", happenedTime: "25:00" })).toEqual([
      "public_id_empty",
      "caption_empty",
      "time_invalid",
      "width_invalid",
      "height_invalid",
    ])
  })
})

describe("validateNewMemory: photo, audio or both", () => {
  const AUDIO = { publicId: "my-life/memories/audio-1", format: "webm", bytes: 1000, durationMs: 5000 }

  it("accepts an audio-only memory: no photo, no dimensions", () => {
    const only = input({ publicId: null, width: null, height: null, audio: AUDIO })
    expect(validateNewMemory(only, NOW)).toEqual({ ok: true, value: only })
  })

  it("accepts a photo with an audio", () => {
    const both = input({ audio: AUDIO })
    expect(validateNewMemory(both, NOW)).toEqual({ ok: true, value: both })
  })

  it("asks for a photo or an audio when there is neither", () => {
    expect(errorsOf({ publicId: null, width: null, height: null, audio: null })).toEqual(["media_missing"])
  })

  it("still wants valid dimensions for a photo, and none without one", () => {
    expect(errorsOf({ width: null })).toEqual(["width_invalid"])
    expect(errorsOf({ height: 0 })).toEqual(["height_invalid"])
    expect(errorsOf({ publicId: null, width: 100, height: 100, audio: AUDIO })).toEqual(["width_invalid", "height_invalid"])
  })

  it("rejects an empty photo public id", () => {
    expect(errorsOf({ publicId: "  " })).toEqual(["public_id_empty"])
  })

  it("rejects an audio whose public id is empty, or whose numbers are not positive integers", () => {
    expect(errorsOf({ audio: { ...AUDIO, publicId: " " } })).toEqual(["audio_invalid"])
    expect(errorsOf({ audio: { ...AUDIO, durationMs: 0 } })).toEqual(["audio_invalid"])
    expect(errorsOf({ audio: { ...AUDIO, bytes: 1.5 } })).toEqual(["audio_invalid"])
  })

  it("keeps the caption and date rules for an audio-only memory", () => {
    expect(errorsOf({ publicId: null, width: null, height: null, audio: AUDIO, caption: " " })).toEqual(["caption_empty"])
  })
})
