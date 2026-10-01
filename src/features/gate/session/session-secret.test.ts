import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { getSessionSecret } from "./session-secret"

const good = Buffer.alloc(32, 7).toString("base64url")

describe("getSessionSecret", () => {
  it("returns a valid secret", () => {
    expect(getSessionSecret({ SESSION_SECRET: good })).toBe(good)
  })

  it("accepts standard base64 too", () => {
    const b64 = Buffer.alloc(40, 255).toString("base64")
    expect(getSessionSecret({ SESSION_SECRET: b64 })).toBe(b64)
  })

  it("is not configured when missing or blank", () => {
    expect(getSessionSecret({})).toBeNull()
    expect(getSessionSecret({ SESSION_SECRET: "" })).toBeNull()
    expect(getSessionSecret({ SESSION_SECRET: "   " })).toBeNull()
  })

  it("is not configured when it decodes to fewer than 32 bytes", () => {
    expect(getSessionSecret({ SESSION_SECRET: Buffer.alloc(31, 7).toString("base64url") })).toBeNull()
    expect(getSessionSecret({ SESSION_SECRET: "short" })).toBeNull()
  })

  it("is not configured when it is not base64", () => {
    expect(getSessionSecret({ SESSION_SECRET: `${good}!!!` })).toBeNull()
  })
})
