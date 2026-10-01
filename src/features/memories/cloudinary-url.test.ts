import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  AUDIO_TRANSFORM,
  FULL_TRANSFORM,
  THUMB_TRANSFORM,
  cloudinaryAudioUrl,
  cloudinaryUrl,
  signDeliveryPath,
  squareTransform,
} from "./cloudinary-url"

// Test vector from Cloudinary's "Delivery URL signatures" page: secret `abcd`, the `sample-authenticated.png`
// image with `c_fill,w_300,h_250/e_grayscale`. The signature is the first 8 characters of the URL-safe base64
// SHA-1 of `<transformation>/<public id><secret>`, wrapped as `s--SIGNATURE--`.
describe("signDeliveryPath", () => {
  it("matches the documented vector", () => {
    expect(signDeliveryPath("c_fill,w_300,h_250/e_grayscale", "sample-authenticated.png", "abcd")).toBe("s--iDy_JeBq--")
  })

  it("changes with the secret, the transformation and the public id", () => {
    const base = signDeliveryPath("w_100", "a/b", "s1")
    expect(signDeliveryPath("w_100", "a/b", "s2")).not.toBe(base)
    expect(signDeliveryPath("w_200", "a/b", "s1")).not.toBe(base)
    expect(signDeliveryPath("w_100", "a/c", "s1")).not.toBe(base)
  })
})

describe("cloudinaryUrl", () => {
  it("builds a signed delivery URL of the authenticated type, so the untransformed original is never public", () => {
    expect(cloudinaryUrl("demo", "sample-authenticated.png", "c_fill,w_300,h_250/e_grayscale", "abcd")).toBe(
      "https://res.cloudinary.com/demo/image/authenticated/s--iDy_JeBq--/c_fill,w_300,h_250/e_grayscale/sample-authenticated.png",
    )
  })

  it("never builds a URL of the public upload type", () => {
    const url = cloudinaryUrl("demo", "memories/abc", "w_100", "abcd")
    expect(url).not.toContain("/image/upload/")
    expect(url).toContain("/image/authenticated/s--")
  })

  it("keeps the transformation inside the signature: a URL with it removed is not signed for the original", () => {
    const withTransform = cloudinaryUrl("demo", "memories/abc", "w_100", "abcd")
    const signature = /\/s--([^-]{8})--\//.exec(withTransform)?.[1]
    expect(signature).toBeTruthy()
    // The signature of the bare original is a different one, so the same signature cannot fetch it.
    expect(signDeliveryPath("", "memories/abc", "abcd")).not.toBe(`s--${signature}--`)
  })

  it("never puts the API secret in the URL", () => {
    expect(cloudinaryUrl("demo", "memories/abc", "w_100", "very-secret")).not.toContain("very-secret")
  })

  it("encodes each public id segment but keeps the folder slashes", () => {
    const url = cloudinaryUrl("demo", "memories/ana maría/é?#.jpg", "w_100", "abcd")
    expect(url).toMatch(
      /^https:\/\/res\.cloudinary\.com\/demo\/image\/authenticated\/s--[A-Za-z0-9_-]{8}--\/w_100\/memories\/ana%20mar%C3%ADa\/%C3%A9%3F%23\.jpg$/,
    )
  })

  it("encodes the cloud name", () => {
    expect(cloudinaryUrl("de/mo", "a", "w_1", "abcd")).toContain("/de%2Fmo/image/authenticated/")
  })

  it("refuses path traversal, empty segments and a missing cloud name or secret", () => {
    expect(() => cloudinaryUrl("demo", "a/../b", "w_1", "abcd")).toThrow()
    expect(() => cloudinaryUrl("demo", "./a", "w_1", "abcd")).toThrow()
    expect(() => cloudinaryUrl("demo", "a//b", "w_1", "abcd")).toThrow()
    expect(() => cloudinaryUrl("demo", "", "w_1", "abcd")).toThrow()
    expect(() => cloudinaryUrl("", "a", "w_1", "abcd")).toThrow()
    expect(() => cloudinaryUrl("demo", "a", "w_1", "")).toThrow()
  })

  it("uses a square auto-cropped thumbnail and a width-limited full image", () => {
    expect(THUMB_TRANSFORM).toBe("f_auto,q_auto,c_fill,g_auto,w_160,h_160")
    expect(FULL_TRANSFORM).toBe("f_auto,q_auto,c_limit,w_1600")
  })
})

describe("cloudinaryAudioUrl", () => {
  const AID = "my-life/memories/audio-3f2b8c1e"

  it("transcodes to mp3 (plays on Safari and iOS) as a signed delivery URL of the authenticated video type", () => {
    expect(AUDIO_TRANSFORM).toBe("f_mp3")
    const signature = signDeliveryPath(AUDIO_TRANSFORM, AID, "abcd")
    expect(cloudinaryAudioUrl("demo", AID, "abcd")).toBe(
      `https://res.cloudinary.com/demo/video/authenticated/${signature}/f_mp3/${AID}`,
    )
  })

  it("never builds a public upload URL and never puts the secret in the URL", () => {
    const url = cloudinaryAudioUrl("demo", AID, "very-secret")
    expect(url).not.toContain("/video/upload/")
    expect(url).not.toContain("very-secret")
  })

  it("refuses path traversal and a missing cloud name or secret", () => {
    expect(() => cloudinaryAudioUrl("demo", "a/../b", "abcd")).toThrow()
    expect(() => cloudinaryAudioUrl("", AID, "abcd")).toThrow()
    expect(() => cloudinaryAudioUrl("demo", AID, "")).toThrow()
  })
})

describe("squareTransform", () => {
  it("crops a face-aware square of an exact side, in the best format the browser takes", () => {
    expect(squareTransform(384)).toBe("f_auto,q_auto,c_fill,g_auto,w_384,h_384")
  })

  it("asks for the best quality on the sizes the glass and the approach show up close", () => {
    expect(squareTransform(768)).toBe("f_auto,q_auto:best,c_fill,g_auto,w_768,h_768")
    expect(squareTransform(1600)).toBe("f_auto,q_auto:best,c_fill,g_auto,w_1600,h_1600")
  })

  it("only takes whole positive sides", () => {
    expect(() => squareTransform(0)).toThrow()
    expect(() => squareTransform(12.5)).toThrow()
  })
})
