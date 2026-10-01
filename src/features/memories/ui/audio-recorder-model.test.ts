import { describe, expect, it } from "vitest"
import { MAX_AUDIO_MS } from "../upload-limits"
import {
  INITIAL_RECORDER,
  RECORDER_COPY,
  errorFromName,
  fileNameFor,
  formatClock,
  pickRecorderMime,
  recorderReducer,
  type RecorderEvent,
  type RecorderState,
} from "./audio-recorder-model"

const run = (events: RecorderEvent[], from: RecorderState = INITIAL_RECORDER) => events.reduce(recorderReducer, from)

const recording = run([{ type: "request" }, { type: "started" }])
const recorded = run([{ type: "stopped", durationMs: 4200 }], recording)

describe("recorderReducer", () => {
  it("starts idle with nothing recorded and no error", () => {
    expect(INITIAL_RECORDER).toEqual({ phase: "idle", elapsedMs: 0, durationMs: null, source: null, error: null })
  })

  it("asks for the microphone, then records once it is granted", () => {
    const requesting = run([{ type: "request" }])
    expect(requesting.phase).toBe("requesting")
    expect(recording).toMatchObject({ phase: "recording", elapsedMs: 0, error: null })
  })

  it("counts the time while recording, never going back", () => {
    const later = run([{ type: "tick", elapsedMs: 3000 }, { type: "tick", elapsedMs: 2500 }], recording)
    expect(later.elapsedMs).toBe(3000)
  })

  it("caps the time at 2 minutes", () => {
    expect(run([{ type: "tick", elapsedMs: MAX_AUDIO_MS + 5000 }], recording).elapsedMs).toBe(MAX_AUDIO_MS)
    expect(run([{ type: "tick", elapsedMs: MAX_AUDIO_MS }], recording).elapsedMs).toBe(MAX_AUDIO_MS)
  })

  it("ignores ticks that are not while recording", () => {
    expect(run([{ type: "tick", elapsedMs: 900 }])).toEqual(INITIAL_RECORDER)
    expect(run([{ type: "tick", elapsedMs: 900 }], recorded)).toEqual(recorded)
  })

  it("keeps what was recorded when it stops, with its length and where it came from", () => {
    expect(recorded).toEqual({ phase: "recorded", elapsedMs: 0, durationMs: 4200, source: "recording", error: null })
  })

  it("never keeps more than 2 minutes of a recording", () => {
    expect(run([{ type: "stopped", durationMs: MAX_AUDIO_MS + 700 }], recording).durationMs).toBe(MAX_AUDIO_MS)
  })

  it("plays and pauses what was recorded, and goes back to recorded when it ends", () => {
    const playing = run([{ type: "play" }], recorded)
    expect(playing).toMatchObject({ phase: "playing", durationMs: 4200, source: "recording" })
    expect(run([{ type: "pause" }], playing).phase).toBe("recorded")
    expect(run([{ type: "ended" }], playing).phase).toBe("recorded")
  })

  it("cannot play when there is nothing to play, or while recording", () => {
    expect(run([{ type: "play" }])).toEqual(INITIAL_RECORDER)
    expect(run([{ type: "play" }], recording)).toEqual(recording)
  })

  it("discards at any point and goes back to idle, clearing the error", () => {
    for (const state of [recording, recorded, run([{ type: "play" }], recorded)]) {
      expect(run([{ type: "discard" }], state)).toEqual(INITIAL_RECORDER)
    }
    const failed = run([{ type: "request" }, { type: "failed", error: "denied" }])
    expect(run([{ type: "discard" }], failed)).toEqual(INITIAL_RECORDER)
  })

  it("lets the visitor record again over a recording, which starts over", () => {
    const again = run([{ type: "request" }], recorded)
    expect(again).toMatchObject({ phase: "requesting", durationMs: null, source: null, error: null })
  })

  it("does not ask for the microphone twice while it is already recording or asking", () => {
    expect(run([{ type: "request" }], recording)).toEqual(recording)
    const requesting = run([{ type: "request" }])
    expect(run([{ type: "request" }], requesting)).toEqual(requesting)
  })

  it.each(["denied", "no_device", "unsupported", "failed"] as const)("goes back to idle with the %s error when asking fails", (error) => {
    const state = run([{ type: "request" }, { type: "failed", error }])
    expect(state).toEqual({ ...INITIAL_RECORDER, error })
  })

  it("goes back to idle with a failed error when the recorder breaks mid-recording", () => {
    expect(run([{ type: "failed", error: "failed" }], recording)).toEqual({ ...INITIAL_RECORDER, error: "failed" })
  })

  it("starts a new request without the previous error", () => {
    const failed = run([{ type: "request" }, { type: "failed", error: "denied" }])
    expect(run([{ type: "request" }], failed).error).toBeNull()
  })

  it("takes an uploaded file as the audio, with its length when it is known", () => {
    expect(run([{ type: "loaded", durationMs: 9000 }])).toEqual({
      phase: "recorded",
      elapsedMs: 0,
      durationMs: 9000,
      source: "file",
      error: null,
    })
    expect(run([{ type: "loaded", durationMs: null }]).durationMs).toBeNull()
  })

  it("lets an uploaded file replace a recording, but not interrupt one in progress", () => {
    expect(run([{ type: "loaded", durationMs: 100 }], recorded).source).toBe("file")
    expect(run([{ type: "loaded", durationMs: 100 }], recording)).toEqual(recording)
  })
})

describe("errorFromName", () => {
  it("tells a refusal from a missing microphone from anything else", () => {
    expect(errorFromName("NotAllowedError")).toBe("denied")
    expect(errorFromName("SecurityError")).toBe("denied")
    expect(errorFromName("PermissionDeniedError")).toBe("denied")
    expect(errorFromName("NotFoundError")).toBe("no_device")
    expect(errorFromName("OverconstrainedError")).toBe("no_device")
    expect(errorFromName("NotReadableError")).toBe("failed")
    expect(errorFromName("AbortError")).toBe("failed")
    expect(errorFromName(undefined)).toBe("failed")
  })
})

describe("pickRecorderMime", () => {
  const only = (...supported: string[]) => (type: string) => supported.includes(type)

  it("prefers webm with opus (Chrome, Firefox, Edge, recent Safari)", () => {
    expect(pickRecorderMime(only("audio/webm;codecs=opus", "audio/mp4"))).toBe("audio/webm;codecs=opus")
  })

  it("falls back to mp4 on a browser that only records that (older Safari and iOS)", () => {
    expect(pickRecorderMime(only("audio/mp4"))).toBe("audio/mp4")
  })

  it("tries ogg and plain webm too", () => {
    expect(pickRecorderMime(only("audio/ogg;codecs=opus"))).toBe("audio/ogg;codecs=opus")
    expect(pickRecorderMime(only("audio/webm"))).toBe("audio/webm")
  })

  it("lets the browser choose when it says it supports none of them", () => {
    expect(pickRecorderMime(only())).toBeUndefined()
  })

  it("lets the browser choose when it cannot even say", () => {
    expect(pickRecorderMime(undefined)).toBeUndefined()
    expect(pickRecorderMime(() => {
      throw new Error("nope")
    })).toBeUndefined()
  })
})

describe("fileNameFor", () => {
  it("names a recording after its container so Cloudinary has an extension to go by", () => {
    expect(fileNameFor("audio/webm;codecs=opus")).toBe("recuerdo.webm")
    expect(fileNameFor("audio/mp4")).toBe("recuerdo.m4a")
    expect(fileNameFor("audio/ogg;codecs=opus")).toBe("recuerdo.ogg")
    expect(fileNameFor("audio/wav")).toBe("recuerdo.wav")
    expect(fileNameFor("")).toBe("recuerdo.webm")
  })
})

describe("formatClock", () => {
  it("shows minutes and seconds", () => {
    expect(formatClock(0)).toBe("0:00")
    expect(formatClock(7_400)).toBe("0:07")
    expect(formatClock(65_000)).toBe("1:05")
    expect(formatClock(MAX_AUDIO_MS)).toBe("2:00")
  })

  it("rounds down and tolerates nonsense", () => {
    expect(formatClock(1_999)).toBe("0:01")
    expect(formatClock(-5)).toBe("0:00")
    expect(formatClock(Number.NaN)).toBe("0:00")
  })
})

describe("RECORDER_COPY", () => {
  it("has a short Spanish message for every way recording can fail", () => {
    for (const error of ["denied", "no_device", "unsupported", "failed"] as const) {
      expect(RECORDER_COPY.errors[error].length).toBeGreaterThan(10)
    }
    expect(RECORDER_COPY.errors.denied).toMatch(/micrófono/)
    expect(RECORDER_COPY.errors.unsupported).toMatch(/Sube/)
  })
})
