import { describe, expect, it } from "vitest"
import { MAX_AUDIO_BYTES, MAX_AUDIO_MS, MAX_UPLOAD_BYTES } from "../upload-limits"
import { COPY, localToday, messageForFailure, validateForm } from "./memory-form-model"

const photo = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: "foto.jpg",
  type: "image/jpeg",
  size: 2000,
  ...over,
})

describe("localToday", () => {
  it("formats the local calendar date as YYYY-MM-DD", () => {
    expect(localToday(new Date(2026, 9, 1, 23, 30))).toBe("2026-10-01")
    expect(localToday(new Date(2026, 0, 5, 0, 5))).toBe("2026-01-05")
  })
})

describe("validateForm", () => {
  const ok = { file: photo(), caption: "Una tarde", date: "2024-03-12", today: "2026-10-01" }

  it("has no errors for a complete form", () => {
    expect(validateForm(ok)).toEqual({})
  })

  it("asks for a photo or an audio when there is neither", () => {
    expect(validateForm({ ...ok, file: null })).toEqual({ media: COPY.media })
    expect(COPY.media).toBe("Agrega una foto o un audio.")
  })

  it("refuses the wrong type or size of a photo", () => {
    expect(validateForm({ ...ok, file: photo({ type: "image/gif", name: "a.gif" }) }).photo).toBe(COPY.photoType)
    expect(validateForm({ ...ok, file: photo({ size: MAX_UPLOAD_BYTES + 1 }) }).photo).toBe(COPY.photoSize)
  })

  it("wants 1 to 140 characters, counting code points and ignoring surrounding spaces", () => {
    expect(validateForm({ ...ok, caption: "   " }).caption).toBe(COPY.caption)
    expect(validateForm({ ...ok, caption: "a".repeat(140) }).caption).toBeUndefined()
    expect(validateForm({ ...ok, caption: "a".repeat(141) }).caption).toBe(COPY.caption)
    expect(validateForm({ ...ok, caption: "😀".repeat(140) }).caption).toBeUndefined()
  })

  it("refuses a missing, future or too old date", () => {
    expect(validateForm({ ...ok, date: "" }).date).toBe(COPY.dateInvalid)
    expect(validateForm({ ...ok, date: "2026-10-02" }).date).toBe(COPY.dateFuture)
    expect(validateForm({ ...ok, date: "2026-10-01" }).date).toBeUndefined()
    expect(validateForm({ ...ok, date: "1899-12-31" }).date).toBe(COPY.dateInvalid)
    expect(validateForm({ ...ok, date: "1900-01-01" }).date).toBeUndefined()
  })

  it("takes no time, or a 24 h HH:MM, like the server", () => {
    expect(validateForm({ ...ok, time: "" })).toEqual({})
    expect(validateForm({ ...ok, time: "00:00" })).toEqual({})
    expect(validateForm({ ...ok, time: "23:59" })).toEqual({})
    expect(validateForm({ ...ok, time: "24:00" }).time).toBe(COPY.timeInvalid)
    expect(validateForm({ ...ok, time: "7:05" }).time).toBe(COPY.timeInvalid)
    expect(validateForm({ ...ok, time: "18:42:07" }).time).toBe(COPY.timeInvalid)
    expect(COPY.timeInvalid).toBe("Elige una hora válida o déjala vacía.")
  })

  it("never lets the time change the date rules", () => {
    expect(validateForm({ ...ok, date: "2026-10-02", time: "00:00" }).date).toBe(COPY.dateFuture)
    expect(validateForm({ ...ok, date: "2026-10-01", time: "23:59" })).toEqual({})
  })
})

describe("messageForFailure", () => {
  it("speaks plainly about each way saving can fail", () => {
    expect(messageForFailure({ ok: false, reason: "rate_limited" })).toEqual({ form: COPY.rateLimited })
    expect(messageForFailure({ ok: false, reason: "no_session" })).toEqual({ form: COPY.noSession })
    expect(messageForFailure({ ok: false, reason: "asset_too_large" })).toEqual({ photo: COPY.photoSize })
    expect(messageForFailure({ ok: false, reason: "asset_type" })).toEqual({ photo: COPY.photoType })
    expect(messageForFailure({ ok: false, reason: "audio_type" })).toEqual({ audio: COPY.audioType })
    expect(messageForFailure({ ok: false, reason: "audio_too_large" })).toEqual({ audio: COPY.audioSize })
    expect(messageForFailure({ ok: false, reason: "audio_too_long" })).toEqual({ audio: COPY.audioLong })
    for (const reason of ["unavailable", "invalid_ticket", "asset_missing", "audio_missing", "duplicate"] as const) {
      expect(messageForFailure({ ok: false, reason })).toEqual({ form: COPY.unavailable })
    }
  })

  it("maps validation errors to their fields", () => {
    expect(messageForFailure({ ok: false, reason: "invalid", errors: ["caption_empty", "date_in_future"] })).toEqual({
      caption: COPY.caption,
      date: COPY.dateFuture,
    })
    expect(messageForFailure({ ok: false, reason: "invalid", errors: ["caption_too_long", "date_too_old"] })).toEqual({
      caption: COPY.caption,
      date: COPY.dateInvalid,
    })
    expect(messageForFailure({ ok: false, reason: "invalid", errors: ["width_invalid"] })).toEqual({ form: COPY.unavailable })
    expect(messageForFailure({ ok: false, reason: "invalid", errors: ["time_invalid"] })).toEqual({ time: COPY.timeInvalid })
  })
})

describe("validateForm: audio", () => {
  const ok = { file: photo(), caption: "Una tarde", date: "2024-03-12", today: "2026-10-01" }
  const voice = (over: Partial<{ name: string; type: string; size: number; durationMs: number | null }> = {}) => ({
    name: "nota.webm",
    type: "audio/webm;codecs=opus",
    size: 50_000,
    durationMs: 12_000,
    ...over,
  })

  it("accepts an audio with no photo, a photo with no audio, and both", () => {
    expect(validateForm({ ...ok, file: null, audio: voice() })).toEqual({})
    expect(validateForm({ ...ok, audio: null })).toEqual({})
    expect(validateForm({ ...ok, audio: voice() })).toEqual({})
  })

  it("still asks for a photo or an audio when neither is there, and not for a photo in particular", () => {
    const errors = validateForm({ ...ok, file: null, audio: null })
    expect(errors.media).toBe(COPY.media)
    expect(errors.photo).toBeUndefined()
    expect(errors.audio).toBeUndefined()
  })

  it("refuses an audio of the wrong type, over the size cap, or longer than 60 minutes", () => {
    expect(validateForm({ ...ok, audio: voice({ type: "image/png", name: "a.png" }) }).audio).toBe(COPY.audioType)
    expect(validateForm({ ...ok, audio: voice({ size: MAX_AUDIO_BYTES + 1 }) }).audio).toBe(COPY.audioSize)
    expect(validateForm({ ...ok, audio: voice({ durationMs: MAX_AUDIO_MS + 1 }) }).audio).toBe(COPY.audioLong)
  })

  it("accepts exactly the cap and exactly 60 minutes, and an audio whose length the browser could not read", () => {
    expect(validateForm({ ...ok, audio: voice({ size: MAX_AUDIO_BYTES }) }).audio).toBeUndefined()
    expect(validateForm({ ...ok, audio: voice({ durationMs: MAX_AUDIO_MS }) }).audio).toBeUndefined()
    expect(validateForm({ ...ok, audio: voice({ durationMs: null }) }).audio).toBeUndefined()
  })

  it("tells the visitor to stop the recording before saving, instead of asking for an audio", () => {
    expect(validateForm({ ...ok, file: null, audio: null, recording: true })).toEqual({ audio: COPY.audioRecording })
    expect(COPY.audioRecording).toBe("Detén la grabación antes de guardar.")
  })

  it("keeps the caption and date rules for an audio-only memory", () => {
    const errors = validateForm({ ...ok, file: null, audio: voice(), caption: " ", date: "2999-01-01" })
    expect(errors).toEqual({ caption: COPY.caption, date: COPY.dateFuture })
  })

  it("maps the server's audio and media answers to their fields", () => {
    expect(messageForFailure({ ok: false, reason: "invalid", errors: ["media_missing"] })).toEqual({ media: COPY.media })
    expect(messageForFailure({ ok: false, reason: "invalid", errors: ["audio_invalid"] })).toEqual({ form: COPY.unavailable })
  })

  it("speaks about the audio in neutral Spanish", () => {
    expect(COPY.audioType).toBe("Elige un audio WebM, OGG, MP3, M4A, AAC o WAV.")
    expect(COPY.audioSize).toBe("El audio supera los 100 MB. Para audios largos usa MP3, M4A u OGG.")
    expect(COPY.audioLong).toBe("El audio dura más de 60 minutos.")
  })
})
