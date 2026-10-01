import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { serializeParams, signCloudinaryParams } from "./cloudinary-signature"

// Test vectors from Cloudinary's "Generating authentication signatures" page (secret `abcd`).
// The SHA-256 digests are the same strings hashed with SHA-256, which the page allows.
describe("signCloudinaryParams", () => {
  it("matches the documented minimal vector (timestamp only), SHA-1", () => {
    expect(signCloudinaryParams({ timestamp: "1315060510" }, "abcd", "sha1")).toBe(
      "a21ad0f63beb4de2e5575204b79ab90bffb02c10",
    )
  })

  it("matches the documented vector with extra params, sorted by name, SHA-1", () => {
    const params = { timestamp: "1315060510", public_id: "sample_image", eager: "w_400,h_300,c_pad|w_260,h_200,c_crop" }
    expect(signCloudinaryParams(params, "abcd", "sha1")).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e")
  })

  it("signs with SHA-256 when asked, and by default", () => {
    expect(signCloudinaryParams({ timestamp: "1315060510" }, "abcd", "sha256")).toBe(
      "5652e549a70bdc03f73a633a23b7d3f3b067d72fff26dd15b25997f46fdf6439",
    )
    expect(signCloudinaryParams({ timestamp: "1315060510" }, "abcd")).toBe(
      "5652e549a70bdc03f73a633a23b7d3f3b067d72fff26dd15b25997f46fdf6439",
    )
  })

  it("does not depend on the order the params are given in", () => {
    const a = signCloudinaryParams({ b: "2", a: "1" }, "s")
    const b = signCloudinaryParams({ a: "1", b: "2" }, "s")
    expect(a).toBe(b)
  })

  it("changes when the secret or any value changes", () => {
    const base = signCloudinaryParams({ public_id: "x", timestamp: "1" }, "s")
    expect(signCloudinaryParams({ public_id: "x", timestamp: "1" }, "t")).not.toBe(base)
    expect(signCloudinaryParams({ public_id: "y", timestamp: "1" }, "s")).not.toBe(base)
  })
})

describe("serializeParams", () => {
  it("sorts by name and joins name=value pairs with &", () => {
    expect(serializeParams({ timestamp: "1", public_id: "x", allowed_formats: "jpg,png" })).toBe(
      "allowed_formats=jpg,png&public_id=x&timestamp=1",
    )
  })

  it("leaves out empty values, as Cloudinary does", () => {
    expect(serializeParams({ a: "", b: "2" })).toBe("b=2")
  })
})
