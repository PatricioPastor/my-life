import { describe, expect, it } from "vitest"
import { verifyAsset, type AssetInfo } from "./cloudinary-assets"
import { MAX_UPLOAD_BYTES } from "./upload-limits"

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
