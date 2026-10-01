import { describe, expect, it } from "vitest"
import {
  ALLOWED_FORMATS,
  ALLOWED_FORMATS_PARAM,
  AUDIO_FORMATS,
  AUDIO_FORMATS_PARAM,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_MS,
  MAX_UPLOAD_BYTES,
  checkAudio,
  checkPhoto,
} from "./upload-limits"

const photo = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: "foto.jpg",
  type: "image/jpeg",
  size: 1000,
  ...over,
})

describe("upload limits", () => {
  it("allows exactly JPG, PNG, WebP and HEIC/HEIF, as Cloudinary's allowed_formats list", () => {
    expect([...ALLOWED_FORMATS]).toEqual(["jpg", "png", "webp", "heic", "heif"])
    expect(ALLOWED_FORMATS_PARAM).toBe("jpg,png,webp,heic,heif")
  })

  it("caps a photo at 10 MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024)
  })
})

describe("checkPhoto", () => {
  it.each(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])("accepts %s", (type) => {
    expect(checkPhoto(photo({ type }))).toBe("ok")
  })

  it("accepts a photo of exactly 10 MB and refuses one byte more", () => {
    expect(checkPhoto(photo({ size: MAX_UPLOAD_BYTES }))).toBe("ok")
    expect(checkPhoto(photo({ size: MAX_UPLOAD_BYTES + 1 }))).toBe("too_large")
  })

  it("refuses an empty file", () => {
    expect(checkPhoto(photo({ size: 0 }))).toBe("unsupported_type")
  })

  it.each(["image/gif", "image/svg+xml", "application/pdf", "video/mp4"])("refuses %s", (type) => {
    expect(checkPhoto(photo({ type, name: "x.gif" }))).toBe("unsupported_type")
  })

  it("trusts the extension only when the browser gives no type (HEIC on Windows)", () => {
    expect(checkPhoto(photo({ type: "", name: "IMG_0001.HEIC" }))).toBe("ok")
    expect(checkPhoto(photo({ type: "application/octet-stream", name: "a.heif" }))).toBe("ok")
    expect(checkPhoto(photo({ type: "", name: "a.gif" }))).toBe("unsupported_type")
    expect(checkPhoto(photo({ type: "image/gif", name: "a.heic" }))).toBe("unsupported_type")
  })

  it("reports the type before the size", () => {
    expect(checkPhoto(photo({ type: "image/gif", size: MAX_UPLOAD_BYTES + 1 }))).toBe("unsupported_type")
  })
})

const audio = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: "nota.webm",
  type: "audio/webm",
  size: 1000,
  ...over,
})

describe("audio limits", () => {
  it("allows webm, ogg, opus, mp3, m4a, mp4, aac and wav, as Cloudinary's allowed_formats list", () => {
    expect([...AUDIO_FORMATS]).toEqual(["webm", "ogg", "opus", "mp3", "m4a", "mp4", "aac", "wav"])
    expect(AUDIO_FORMATS_PARAM).toBe("webm,ogg,opus,mp3,m4a,mp4,aac,wav")
  })

  it("caps an audio at 2 minutes and 15 MB", () => {
    expect(MAX_AUDIO_MS).toBe(120_000)
    expect(MAX_AUDIO_BYTES).toBe(15 * 1024 * 1024)
  })
})

describe("checkAudio", () => {
  it.each([
    "audio/webm",
    "audio/ogg",
    "audio/opus",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
    "audio/aac",
    "audio/wav",
    "audio/x-wav",
    "video/webm",
  ])("accepts %s", (type) => {
    expect(checkAudio(audio({ type }))).toBe("ok")
  })

  it("accepts a MIME type with codec parameters, as MediaRecorder reports it", () => {
    expect(checkAudio(audio({ type: "audio/webm;codecs=opus" }))).toBe("ok")
  })

  it("accepts an audio of exactly 15 MB and refuses one byte more", () => {
    expect(checkAudio(audio({ size: MAX_AUDIO_BYTES }))).toBe("ok")
    expect(checkAudio(audio({ size: MAX_AUDIO_BYTES + 1 }))).toBe("too_large")
  })

  it("refuses an empty file", () => {
    expect(checkAudio(audio({ size: 0 }))).toBe("unsupported_type")
  })

  it.each(["image/jpeg", "video/mp4", "application/pdf", "text/plain"])("refuses %s", (type) => {
    expect(checkAudio(audio({ type, name: "x.bin" }))).toBe("unsupported_type")
  })

  it("trusts the extension only when the browser gives no type", () => {
    expect(checkAudio(audio({ type: "", name: "Nota.M4A" }))).toBe("ok")
    expect(checkAudio(audio({ type: "application/octet-stream", name: "a.mp3" }))).toBe("ok")
    expect(checkAudio(audio({ type: "", name: "a.exe" }))).toBe("unsupported_type")
    expect(checkAudio(audio({ type: "image/png", name: "a.mp3" }))).toBe("unsupported_type")
  })

  it("reports the type before the size", () => {
    expect(checkAudio(audio({ type: "image/png", size: MAX_AUDIO_BYTES + 1 }))).toBe("unsupported_type")
  })
})
