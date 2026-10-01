import { describe, expect, it } from "vitest"
import { SECURITY_HEADERS } from "./security-headers"

describe("SECURITY_HEADERS", () => {
  const map = Object.fromEntries(SECURITY_HEADERS.map((h) => [h.key, h.value]))

  it("hardens content sniffing, referrers and framing", () => {
    expect(map["X-Content-Type-Options"]).toBe("nosniff")
    expect(map["Referrer-Policy"]).toBe("strict-origin-when-cross-origin")
    expect(map["X-Frame-Options"]).toBe("DENY")
  })

  it("allows the microphone for our own origin only, and denies camera, geolocation and FLoC", () => {
    expect(map["Permissions-Policy"]).toBe("camera=(), microphone=(self), geolocation=(), interest-cohort=()")
  })

  it("never opens the microphone to other origins", () => {
    expect(map["Permissions-Policy"]).not.toMatch(/microphone=\(\*\)|microphone=\([^)]*https?:/)
  })
})
