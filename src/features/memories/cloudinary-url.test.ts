import { describe, expect, it } from "vitest"
import { FULL_TRANSFORM, THUMB_TRANSFORM, cloudinaryUrl } from "./cloudinary-url"

describe("cloudinaryUrl", () => {
  it("builds a delivery URL from cloud, transform and public id", () => {
    expect(cloudinaryUrl("demo", "memories/abc", "w_100")).toBe(
      "https://res.cloudinary.com/demo/image/upload/w_100/memories/abc",
    )
  })

  it("encodes each public id segment but keeps the folder slashes", () => {
    expect(cloudinaryUrl("demo", "memories/ana maría/é?#.jpg", "w_100")).toBe(
      "https://res.cloudinary.com/demo/image/upload/w_100/memories/ana%20mar%C3%ADa/%C3%A9%3F%23.jpg",
    )
  })

  it("encodes the cloud name", () => {
    expect(cloudinaryUrl("de/mo", "a", "w_1")).toContain("/de%2Fmo/image/upload/")
  })

  it("refuses path traversal and empty segments", () => {
    expect(() => cloudinaryUrl("demo", "a/../b", "w_1")).toThrow()
    expect(() => cloudinaryUrl("demo", "./a", "w_1")).toThrow()
    expect(() => cloudinaryUrl("demo", "a//b", "w_1")).toThrow()
    expect(() => cloudinaryUrl("demo", "", "w_1")).toThrow()
    expect(() => cloudinaryUrl("", "a", "w_1")).toThrow()
  })

  it("uses a square auto-cropped thumbnail and a width-limited full image", () => {
    expect(THUMB_TRANSFORM).toBe("f_auto,q_auto,c_fill,g_auto,w_160,h_160")
    expect(FULL_TRANSFORM).toBe("f_auto,q_auto,c_limit,w_1600")
  })
})
