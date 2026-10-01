import { describe, expect, it } from "vitest"
import { MAX_UPLOAD_BYTES } from "../upload-limits"
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

  it("asks for a photo, and refuses the wrong type or size", () => {
    expect(validateForm({ ...ok, file: null }).photo).toBe(COPY.photoType)
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
})

describe("messageForFailure", () => {
  it("speaks plainly about each way saving can fail", () => {
    expect(messageForFailure({ ok: false, reason: "rate_limited" })).toEqual({ form: COPY.rateLimited })
    expect(messageForFailure({ ok: false, reason: "no_session" })).toEqual({ form: COPY.noSession })
    expect(messageForFailure({ ok: false, reason: "asset_too_large" })).toEqual({ photo: COPY.photoSize })
    expect(messageForFailure({ ok: false, reason: "asset_type" })).toEqual({ photo: COPY.photoType })
    for (const reason of ["unavailable", "invalid_ticket", "asset_missing", "duplicate"] as const) {
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
  })
})
