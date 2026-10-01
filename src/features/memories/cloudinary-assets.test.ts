import { describe, expect, it } from "vitest"
import { verifyAsset, verifyAudio, type AssetInfo, type AudioInfo } from "./cloudinary-assets"
import { MAX_AUDIO_BYTES, MAX_AUDIO_MS, MAX_UPLOAD_BYTES } from "./upload-limits"

const PID = "my-life/memories/3f2b8c1e-6d4a-4f3b-9c1d-0a1b2c3d4e5f"
const asset = (over: Partial<AssetInfo> = {}): AssetInfo => ({
  publicId: PID,
  resourceType: "image",
  type: "authenticated",
  format: "jpg",
  bytes: 1_000_000,
  width: 4032,
  height: 3024,
  ...over,
})

describe("verifyAsset", () => {
  it("accepts an authenticated image of ours and returns Cloudinary's dimensions", () => {
    expect(verifyAsset(asset(), PID)).toEqual({ ok: true, width: 4032, height: 3024 })
  })

  it.each([
    ["a public upload (its original would carry the EXIF and GPS)", asset({ type: "upload" })],
    ["a private upload", asset({ type: "private" })],
    ["a video", asset({ resourceType: "video" })],
    ["a format we do not allow", asset({ format: "gif" })],
  ])("refuses %s", (_name, info) => {
    expect(verifyAsset(info, PID)).toEqual({ ok: false, problem: "asset_type" })
  })

  it("refuses a missing asset, another public id and one outside our folder", () => {
    expect(verifyAsset(null, PID)).toEqual({ ok: false, problem: "asset_missing" })
    expect(verifyAsset(asset({ publicId: "my-life/memories/other" }), PID)).toEqual({ ok: false, problem: "asset_missing" })
    expect(verifyAsset(asset({ publicId: "elsewhere/x" }), "elsewhere/x")).toEqual({ ok: false, problem: "asset_missing" })
  })

  it("refuses an asset over the size limit", () => {
    expect(verifyAsset(asset({ bytes: MAX_UPLOAD_BYTES + 1 }), PID)).toEqual({ ok: false, problem: "asset_too_large" })
  })
})

const AID = "my-life/memories/audio-3f2b8c1e-6d4a-4f3b-9c1d-0a1b2c3d4e5f"
const voice = (over: Partial<AudioInfo> = {}): AudioInfo => ({
  publicId: AID,
  resourceType: "video",
  type: "authenticated",
  format: "webm",
  bytes: 200_000,
  durationSeconds: 42.5,
  isAudio: true,
  ...over,
})

describe("verifyAudio", () => {
  it("accepts an authenticated audio of ours and takes the duration, size and format from Cloudinary", () => {
    expect(verifyAudio(voice(), AID)).toEqual({ ok: true, durationMs: 42_500, bytes: 200_000, format: "webm" })
  })

  it("lowercases the format and rounds the duration to a millisecond", () => {
    expect(verifyAudio(voice({ format: "M4A", durationSeconds: 1.23456 }), AID)).toEqual({
      ok: true,
      durationMs: 1235,
      bytes: 200_000,
      format: "m4a",
    })
  })

  it.each([
    ["a public upload", voice({ type: "upload" })],
    ["a private upload", voice({ type: "private" })],
    ["an image", voice({ resourceType: "image" })],
    ["a video with pictures (not audio)", voice({ isAudio: false })],
    ["a format we do not allow", voice({ format: "flac" })],
    ["an asset with no duration", voice({ durationSeconds: null })],
    ["an asset with a zero duration", voice({ durationSeconds: 0 })],
    ["an asset with a negative duration", voice({ durationSeconds: -1 })],
    ["an asset with a duration that is not a number", voice({ durationSeconds: Number.NaN })],
  ])("refuses %s", (_name, info) => {
    expect(verifyAudio(info, AID)).toEqual({ ok: false, problem: "audio_type" })
  })

  it("refuses a missing asset, another public id and one outside our folder", () => {
    expect(verifyAudio(null, AID)).toEqual({ ok: false, problem: "audio_missing" })
    expect(verifyAudio(voice({ publicId: "my-life/memories/other" }), AID)).toEqual({ ok: false, problem: "audio_missing" })
    expect(verifyAudio(voice({ publicId: "elsewhere/x" }), "elsewhere/x")).toEqual({ ok: false, problem: "audio_missing" })
  })

  it("takes the size cap from the caller, so a server can raise or lower it", () => {
    expect(verifyAudio(voice({ bytes: 150_000_000 }), AID, 200_000_000).ok).toBe(true)
    expect(verifyAudio(voice({ bytes: 150_000_000 }), AID, 120_000_000)).toEqual({ ok: false, problem: "audio_too_large" })
  })

  it("refuses an audio over the cap and accepts exactly the cap", () => {
    expect(verifyAudio(voice({ bytes: MAX_AUDIO_BYTES }), AID).ok).toBe(true)
    expect(verifyAudio(voice({ bytes: MAX_AUDIO_BYTES + 1 }), AID)).toEqual({ ok: false, problem: "audio_too_large" })
  })

  it("accepts up to 60 minutes (plus 5 seconds of recorder drift) and refuses longer", () => {
    expect(verifyAudio(voice({ durationSeconds: MAX_AUDIO_MS / 1000 }), AID).ok).toBe(true)
    expect(verifyAudio(voice({ durationSeconds: MAX_AUDIO_MS / 1000 + 5 }), AID).ok).toBe(true)
    expect(verifyAudio(voice({ durationSeconds: MAX_AUDIO_MS / 1000 + 5.5 }), AID)).toEqual({
      ok: false,
      problem: "audio_too_long",
    })
  })
})
