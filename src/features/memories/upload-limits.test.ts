import { describe, expect, it } from "vitest"
import { ALLOWED_FORMATS, ALLOWED_FORMATS_PARAM, MAX_UPLOAD_BYTES, checkPhoto } from "./upload-limits"

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
