import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { signCloudinaryParams } from "./cloudinary-signature"
import { prepareUploadWith, type PrepareUploadDeps } from "./prepare-upload"
import type { MemoryRepository } from "./memory-repository"
import { verifyUploadTicket } from "./upload-ticket"

const SECRET = Buffer.alloc(32, 7).toString("base64url")
const API_SECRET = "very-secret-api-secret"
const NOW_MS = 1_800_000_000_000
const ID = "3f2b8c1e-6d4a-4f3b-9c1d-0a1b2c3d4e5f"

function deps(over: Partial<PrepareUploadDeps> = {}, recent = 0) {
  const repository: MemoryRepository = {
    listForVisitor: vi.fn(),
    createPending: vi.fn(),
    countRecentBy: vi.fn(async () => recent),
  }
  const full: PrepareUploadDeps = {
    currentVisitor: async () => ({ handle: "ana" }),
    repository: () => repository,
    cloudinary: { cloudName: "demo", apiKey: "123456", apiSecret: API_SECRET },
    ticketSecret: SECRET,
    now: () => NOW_MS,
    newId: () => ID,
    log: vi.fn(),
    ...over,
  }
  return { full, repository }
}

describe("prepareUploadWith", () => {
  it("answers no_session without touching anything when nobody is admitted", async () => {
    const { full, repository } = deps({ currentVisitor: async () => null })
    expect(await prepareUploadWith(full)).toEqual({ ok: false, reason: "no_session" })
    expect(repository.countRecentBy).not.toHaveBeenCalled()
  })

  it.each([
    ["no Cloudinary config", { cloudinary: null }],
    ["no ticket secret", { ticketSecret: null }],
  ])("answers unavailable with %s", async (_name, over) => {
    const { full, repository } = deps(over)
    expect(await prepareUploadWith(full)).toEqual({ ok: false, reason: "unavailable" })
    expect(repository.countRecentBy).not.toHaveBeenCalled()
  })

  it("answers unavailable, with one handle-free log line, when the database fails", async () => {
    const log = vi.fn()
    const { full } = deps({
      log,
      repository: () => ({
        listForVisitor: vi.fn(),
        createPending: vi.fn(),
        countRecentBy: async () => {
          throw new Error("ana: connection string")
        },
      }),
    })
    expect(await prepareUploadWith(full)).toEqual({ ok: false, reason: "unavailable" })
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0][0])).not.toContain("ana")
  })

  it("counts the last 24 hours for the session handle and refuses at the limit", async () => {
    const { full, repository } = deps({}, 5)
    expect(await prepareUploadWith(full)).toEqual({ ok: false, reason: "rate_limited" })
    expect(repository.countRecentBy).toHaveBeenCalledWith("ana", new Date(NOW_MS - 24 * 60 * 60 * 1000))
  })

  it("still allows the fifth memory", async () => {
    const { full } = deps({}, 4)
    expect((await prepareUploadWith(full)).ok).toBe(true)
  })

  it("returns signed params for a server-chosen public id under our folder", async () => {
    const { full } = deps()
    const result = await prepareUploadWith(full)
    if (!result.ok) throw new Error("expected ok")
    const { upload } = result
    const publicId = `my-life/memories/${ID}`
    expect(upload.cloudName).toBe("demo")
    expect(upload.fields).toMatchObject({
      api_key: "123456",
      timestamp: String(NOW_MS / 1000),
      public_id: publicId,
      allowed_formats: "jpg,png,webp,heic,heif",
      overwrite: "false",
      // Authenticated, so the untransformed original (with its EXIF and GPS) is never publicly fetchable.
      type: "authenticated",
    })
    // The signature covers every field but the API key and itself, with the API secret.
    const { api_key: apiKey, signature, ...signed } = upload.fields
    expect(apiKey).toBe("123456")
    expect(signature).toBe(signCloudinaryParams(signed, API_SECRET))
  })

  it("returns a ticket bound to the handle and the public id, valid for 15 minutes", async () => {
    const { full } = deps()
    const result = await prepareUploadWith(full)
    if (!result.ok) throw new Error("expected ok")
    const nowSec = NOW_MS / 1000
    expect(verifyUploadTicket(result.upload.ticket, SECRET, nowSec)).toEqual({
      h: "ana",
      pid: `my-life/memories/${ID}`,
      exp: nowSec + 900,
    })
    expect(verifyUploadTicket(result.upload.ticket, SECRET, nowSec + 900)).toBeNull()
  })

  it("never leaks the API secret or the session secret", async () => {
    const { full } = deps()
    const json = JSON.stringify(await prepareUploadWith(full))
    expect(json).not.toContain(API_SECRET)
    expect(json).not.toContain(SECRET)
  })
})
