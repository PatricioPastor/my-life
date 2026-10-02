// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { signSession } from "@/features/gate/session/session-token"
import { signUploadTicket } from "../upload-ticket"
import { signShareToken, verifyShareToken } from "./share-token"

const SECRET = Buffer.alloc(32, 7).toString("base64url")
const OTHER_SECRET = Buffer.alloc(32, 9).toString("base64url")
const ID = "3f2b8c1e-6d4a-4f3b-9c1d-0a1b2c3d4e5f"
const OTHER_ID = "11111111-1111-4111-8111-111111111111"

describe("share token", () => {
  it("is short: two 22-character base64url parts", () => {
    expect(signShareToken(ID, SECRET)).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/)
  })

  it("round-trips to the memory id", () => {
    expect(verifyShareToken(signShareToken(ID, SECRET), SECRET)).toBe(ID)
  })

  it("is stable for the same id and secret, and differs per id", () => {
    expect(signShareToken(ID, SECRET)).toBe(signShareToken(ID, SECRET))
    expect(signShareToken(ID, SECRET)).not.toBe(signShareToken(OTHER_ID, SECRET))
  })

  it("verifies an id written in capitals as the same memory", () => {
    expect(verifyShareToken(signShareToken(ID.toUpperCase(), SECRET), SECRET)).toBe(ID)
  })

  it("refuses to sign something that is not a uuid", () => {
    expect(() => signShareToken("nope", SECRET)).toThrow()
  })

  it("rejects a token signed with another secret", () => {
    expect(verifyShareToken(signShareToken(ID, OTHER_SECRET), SECRET)).toBeNull()
  })

  it("rejects a tampered id or signature", () => {
    const [id, mac] = signShareToken(ID, SECRET).split(".")
    const [otherId] = signShareToken(OTHER_ID, SECRET).split(".")
    expect(verifyShareToken(`${otherId}.${mac}`, SECRET)).toBeNull()
    const flipped = `${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`
    expect(verifyShareToken(`${id}.${flipped}`, SECRET)).toBeNull()
  })

  it.each(["", ".", "abc", "a.b", "a.b.c", "!!!!!!!!!!!!!!!!!!!!!!.!!!!!!!!!!!!!!!!!!!!!!", " ", "%00"])(
    "rejects malformed input %j",
    (token) => {
      expect(verifyShareToken(token, SECRET)).toBeNull()
    },
  )

  it("rejects a token of the right shape with a short or long id part", () => {
    const [, mac] = signShareToken(ID, SECRET).split(".")
    expect(verifyShareToken(`AAAA.${mac}`, SECRET)).toBeNull()
    expect(verifyShareToken(`${"A".repeat(40)}.${mac}`, SECRET)).toBeNull()
  })

  it("rejects non-string input", () => {
    expect(verifyShareToken(undefined as unknown as string, SECRET)).toBeNull()
  })

  it("never verifies a session cookie or an upload ticket", () => {
    const session = signSession({ h: "ana", exp: 1_900_000_000 }, SECRET)
    const ticket = signUploadTicket({ h: "ana", pid: "my-life/memories/x", exp: 1_900_000_000 }, SECRET)
    expect(verifyShareToken(session, SECRET)).toBeNull()
    expect(verifyShareToken(ticket, SECRET)).toBeNull()
  })

  it("is never accepted as a session or an upload ticket", async () => {
    const { verifySession } = await import("@/features/gate/session/session-token")
    const { verifyUploadTicket } = await import("../upload-ticket")
    const token = signShareToken(ID, SECRET)
    expect(verifySession(token, SECRET, 0)).toBeNull()
    expect(verifyUploadTicket(token, SECRET, 0)).toBeNull()
  })

  it("is domain separated: a bare HMAC of the id does not verify", async () => {
    const { createHmac } = await import("node:crypto")
    const id = Buffer.from(ID.replaceAll("-", ""), "hex").toString("base64url")
    const bare = createHmac("sha256", SECRET).update(ID).digest().subarray(0, 16).toString("base64url")
    expect(verifyShareToken(`${id}.${bare}`, SECRET)).toBeNull()
  })
})
