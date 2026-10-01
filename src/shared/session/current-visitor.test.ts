import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { currentVisitorWith } from "./current-visitor"
import { signSession } from "./session-token"
import { SESSION_COOKIE } from "./session-cookie"

const SECRET = "a".repeat(43)
const NOW = 1_800_000_000
const allow = (...handles: string[]) => ({ isAllowed: async (h: string) => handles.includes(h) })

function deps(over: Partial<Parameters<typeof currentVisitorWith>[0]> = {}) {
  return {
    readCookie: (name: string) =>
      name === SESSION_COOKIE ? signSession({ h: "ana", exp: NOW + 60 }, SECRET) : undefined,
    secret: SECRET as string | null,
    now: () => NOW * 1000,
    policy: allow("ana"),
    ...over,
  }
}

describe("currentVisitorWith", () => {
  it("returns the handle for a valid token of a whitelisted visitor", async () => {
    expect(await currentVisitorWith(deps())).toEqual({ handle: "ana" })
  })

  it("is null without a cookie", async () => {
    expect(await currentVisitorWith(deps({ readCookie: () => undefined }))).toBeNull()
  })

  it("is null for a bad token", async () => {
    expect(await currentVisitorWith(deps({ readCookie: () => "garbage.token" }))).toBeNull()
  })

  it("is null for an expired token", async () => {
    expect(await currentVisitorWith(deps({ now: () => (NOW + 61) * 1000 }))).toBeNull()
  })

  it("is null when the handle is no longer whitelisted", async () => {
    expect(await currentVisitorWith(deps({ policy: allow("bob") }))).toBeNull()
  })

  it("is null when the secret is not configured", async () => {
    expect(await currentVisitorWith(deps({ secret: null }))).toBeNull()
  })
})
