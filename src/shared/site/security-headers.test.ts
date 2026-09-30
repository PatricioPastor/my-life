import { describe, expect, it } from "vitest"
import { SECURITY_HEADERS } from "./security-headers"

describe("SECURITY_HEADERS", () => {
  const map = Object.fromEntries(SECURITY_HEADERS.map((h) => [h.key, h.value]))

  it("hardens content sniffing, referrers and framing", () => {
    expect(map["X-Content-Type-Options"]).toBe("nosniff")
    expect(map["Referrer-Policy"]).toBe("strict-origin-when-cross-origin")
    expect(map["X-Frame-Options"]).toBe("DENY")
  })

  it("denies camera, microphone, geolocation and FLoC", () => {
    expect(map["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=(), interest-cohort=()")
  })
})
