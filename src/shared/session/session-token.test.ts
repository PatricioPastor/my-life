import { describe, expect, it, vi } from "vitest"

// `server-only` throws outside the react-server condition; tests run in plain node.
vi.mock("server-only", () => ({}))

import { createHmac } from "node:crypto"
import { signSession, verifySession } from "./session-token"

const SECRET = "a".repeat(43)
const NOW = 1_800_000_000
const payload = { h: "ana", exp: NOW + 60 }

const b64 = (s: string) => Buffer.from(s).toString("base64url")
/** Builds a correctly signed token around an arbitrary body, to test payload validation. */
function forge(body: string, secret = SECRET) {
  const p = b64(body)
  return `${p}.${createHmac("sha256", secret).update(p).digest("base64url")}`
}

describe("signSession / verifySession", () => {
  it("round-trips a payload", () => {
    expect(verifySession(signSession(payload, SECRET), SECRET, NOW)).toEqual(payload)
  })

  it("rejects a tampered payload", () => {
    const [, sig] = signSession(payload, SECRET).split(".")
    const evil = b64(JSON.stringify({ h: "eve", exp: payload.exp }))
    expect(verifySession(`${evil}.${sig}`, SECRET, NOW)).toBeNull()
  })

  it("rejects a tampered signature", () => {
    const [p, sig] = signSession(payload, SECRET).split(".")
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1)
    expect(verifySession(`${p}.${flipped}`, SECRET, NOW)).toBeNull()
  })

  it("rejects a truncated signature", () => {
    const [p, sig] = signSession(payload, SECRET).split(".")
    expect(verifySession(`${p}.${sig.slice(0, -2)}`, SECRET, NOW)).toBeNull()
  })

  it("rejects the wrong secret", () => {
    expect(verifySession(signSession(payload, SECRET), "b".repeat(43), NOW)).toBeNull()
  })

  it("rejects an expired token, including exactly at expiry", () => {
    const token = signSession(payload, SECRET)
    expect(verifySession(token, SECRET, payload.exp)).toBeNull()
    expect(verifySession(token, SECRET, payload.exp + 1)).toBeNull()
  })

  it.each([
    ["no dot", "abcdef"],
    ["empty", ""],
    ["extra dot", "a.b.c"],
    ["empty halves", "."],
    ["bad base64", "***.***"],
  ])("rejects a malformed token: %s", (_name, token) => {
    expect(verifySession(token, SECRET, NOW)).toBeNull()
  })

  it("rejects a non-string token", () => {
    expect(verifySession(undefined as unknown as string, SECRET, NOW)).toBeNull()
  })

  it("rejects a signed body that is not JSON", () => {
    expect(verifySession(forge("not json"), SECRET, NOW)).toBeNull()
  })

  it("rejects unknown fields", () => {
    expect(verifySession(forge(JSON.stringify({ ...payload, admin: true })), SECRET, NOW)).toBeNull()
  })

  it("rejects missing or mistyped fields", () => {
    expect(verifySession(forge(JSON.stringify({ h: "ana" })), SECRET, NOW)).toBeNull()
    expect(verifySession(forge(JSON.stringify({ h: 1, exp: payload.exp })), SECRET, NOW)).toBeNull()
    expect(verifySession(forge(JSON.stringify({ h: "ana", exp: "soon" })), SECRET, NOW)).toBeNull()
    expect(verifySession(forge("null"), SECRET, NOW)).toBeNull()
    expect(verifySession(forge("[]"), SECRET, NOW)).toBeNull()
  })

  it("rejects handles that fail the gate format or normalization", () => {
    for (const h of ["", "@ana", "Ana", "has space", "a".repeat(31), "bad-char"]) {
      expect(verifySession(signSession({ h, exp: payload.exp }, SECRET), SECRET, NOW)).toBeNull()
    }
  })
})
