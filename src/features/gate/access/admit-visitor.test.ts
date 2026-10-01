import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/shared/session/session-cookie"
import { verifySession } from "@/shared/session/session-token"
import { admitVisitor, type AdmitDeps } from "./admit-visitor"

const SECRET = "a".repeat(43)
const NOW = 1_800_000_000
const allow = (...handles: string[]) => ({ isAllowed: async (h: string) => handles.includes(h) })

function setup(over: Partial<AdmitDeps> = {}) {
  const setCookie = vi.fn()
  const warn = vi.fn()
  const deps: AdmitDeps = { policy: allow("ana"), secret: SECRET, now: () => NOW * 1000, setCookie, warn, ...over }
  return { deps, setCookie, warn }
}

describe("admitVisitor", () => {
  it("sets a signed session cookie with the right attributes when admitted", async () => {
    const { deps, setCookie } = setup()
    expect(await admitVisitor("@Ana", deps)).toEqual({ status: "granted" })
    expect(setCookie).toHaveBeenCalledOnce()
    const [name, value, options] = setCookie.mock.calls[0]
    expect(name).toBe(SESSION_COOKIE)
    expect(verifySession(value, SECRET, NOW)).toEqual({ h: "ana", exp: NOW + SESSION_MAX_AGE_SECONDS })
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_SECONDS })
  })

  it("sets nothing when denied", async () => {
    const { deps, setCookie } = setup()
    expect(await admitVisitor("eve", deps)).toEqual({ status: "denied" })
    expect(setCookie).not.toHaveBeenCalled()
  })

  it("sets nothing when the handle is invalid", async () => {
    const { deps, setCookie } = setup()
    expect(await admitVisitor("not a handle!", deps)).toEqual({ status: "invalid" })
    expect(setCookie).not.toHaveBeenCalled()
  })

  it("still admits, without a cookie and with one handle-free warning, when the secret is missing", async () => {
    const { deps, setCookie, warn } = setup({ secret: null })
    expect(await admitVisitor("ana", deps)).toEqual({ status: "granted" })
    expect(setCookie).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0][0])).toContain("SESSION_SECRET")
    expect(JSON.stringify(warn.mock.calls)).not.toContain("ana")
  })

  it("does not warn when the secret is missing but the visitor is denied", async () => {
    const { deps, warn } = setup({ secret: null })
    await admitVisitor("eve", deps)
    expect(warn).not.toHaveBeenCalled()
  })
})
