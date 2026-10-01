import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { signSession } from "@/features/gate/session/session-token"
import { signUploadTicket, verifyUploadTicket } from "./upload-ticket"

const SECRET = Buffer.alloc(32, 7).toString("base64url")
const PID = "my-life/memories/3f2b8c1e-6d4a-4f3b-9c1d-0a1b2c3d4e5f"
const NOW = 1_800_000_000
const payload = { h: "ana", pid: PID, exp: NOW + 900 }

describe("upload ticket", () => {
  it("round-trips a genuine, unexpired ticket", () => {
    expect(verifyUploadTicket(signUploadTicket(payload, SECRET), SECRET, NOW)).toEqual(payload)
  })

  it("expires: a ticket at or past its expiry is refused", () => {
    const token = signUploadTicket(payload, SECRET)
    expect(verifyUploadTicket(token, SECRET, payload.exp - 1)).not.toBeNull()
    expect(verifyUploadTicket(token, SECRET, payload.exp)).toBeNull()
    expect(verifyUploadTicket(token, SECRET, payload.exp + 1)).toBeNull()
  })

  it("refuses another secret", () => {
    const token = signUploadTicket(payload, SECRET)
    expect(verifyUploadTicket(token, Buffer.alloc(32, 9).toString("base64url"), NOW)).toBeNull()
  })

  it("refuses a tampered payload (another handle or public id) and a tampered signature", () => {
    const [encoded, sig] = signUploadTicket(payload, SECRET).split(".")
    const swap = (over: Record<string, unknown>) =>
      `${Buffer.from(JSON.stringify({ ...payload, ...over })).toString("base64url")}.${sig}`
    expect(verifyUploadTicket(swap({ h: "eve" }), SECRET, NOW)).toBeNull()
    expect(verifyUploadTicket(swap({ pid: "my-life/memories/other" }), SECRET, NOW)).toBeNull()
    expect(verifyUploadTicket(`${encoded}.${sig.slice(0, -2)}AA`, SECRET, NOW)).toBeNull()
    expect(verifyUploadTicket(`${encoded}`, SECRET, NOW)).toBeNull()
    expect(verifyUploadTicket("", SECRET, NOW)).toBeNull()
    expect(verifyUploadTicket("a.b.c", SECRET, NOW)).toBeNull()
  })

  it("refuses a session cookie presented as a ticket (domain separation and strict shape)", () => {
    const session = signSession({ h: "ana", exp: NOW + 900 }, SECRET)
    expect(verifyUploadTicket(session, SECRET, NOW)).toBeNull()
  })

  it("refuses a validly signed ticket for a public id outside our folder", () => {
    const token = signUploadTicket({ ...payload, pid: "elsewhere/abc" }, SECRET)
    expect(verifyUploadTicket(token, SECRET, NOW)).toBeNull()
  })
})
