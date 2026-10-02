import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { createHash } from "node:crypto"
import { AUDIO_TRANSFORM } from "./cloudinary-url"
import { serializeParams, signCloudinaryParams } from "./cloudinary-signature"
import { prepareUploadWith, type PrepareUploadDeps } from "./prepare-upload"
import type { MemoryRepository } from "./memory-repository"
import { verifyUploadTicket } from "./upload-ticket"

const SECRET = Buffer.alloc(32, 7).toString("base64url")
const API_SECRET = "very-secret-api-secret"
const NOW_MS = 1_800_000_000_000
const ID = "3f2b8c1e-6d4a-4f3b-9c1d-0a1b2c3d4e5f"
const AUDIO_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"
const PHOTO = { photo: true, audio: false }
const VOICE = { photo: false, audio: true }
const BOTH = { photo: true, audio: true }

function deps(over: Partial<PrepareUploadDeps> = {}, recent = 0) {
  const repository: MemoryRepository = {
    listForVisitor: vi.fn(),
    findForVisitor: vi.fn(),
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
    expect(await prepareUploadWith(full, PHOTO)).toEqual({ ok: false, reason: "no_session" })
    expect(repository.countRecentBy).not.toHaveBeenCalled()
  })

  it.each([
    ["no Cloudinary config", { cloudinary: null }],
    ["no ticket secret", { ticketSecret: null }],
  ])("answers unavailable with %s", async (_name, over) => {
    const { full, repository } = deps(over)
    expect(await prepareUploadWith(full, PHOTO)).toEqual({ ok: false, reason: "unavailable" })
    expect(repository.countRecentBy).not.toHaveBeenCalled()
  })

  it("answers unavailable, with one handle-free log line, when the database fails", async () => {
    const log = vi.fn()
    const { full } = deps({
      log,
      repository: () => ({
        listForVisitor: vi.fn(),
        findForVisitor: vi.fn(),
        createPending: vi.fn(),
        countRecentBy: async () => {
          throw new Error("ana: connection string")
        },
      }),
    })
    expect(await prepareUploadWith(full, PHOTO)).toEqual({ ok: false, reason: "unavailable" })
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0][0])).not.toContain("ana")
  })

  it("counts the last 24 hours for the session handle and refuses at the limit", async () => {
    const { full, repository } = deps({}, 5)
    expect(await prepareUploadWith(full, PHOTO)).toEqual({ ok: false, reason: "rate_limited" })
    expect(repository.countRecentBy).toHaveBeenCalledWith("ana", new Date(NOW_MS - 24 * 60 * 60 * 1000))
  })

  it("still allows the fifth memory", async () => {
    const { full } = deps({}, 4)
    expect((await prepareUploadWith(full, PHOTO)).ok).toBe(true)
  })

  it("returns signed params for a server-chosen public id under our folder", async () => {
    const { full } = deps()
    const result = await prepareUploadWith(full, PHOTO)
    if (!result.ok) throw new Error("expected ok")
    const { upload } = result
    const publicId = `my-life/memories/${ID}`
    expect(upload.cloudName).toBe("demo")
    expect(upload.photo).toMatchObject({
      api_key: "123456",
      timestamp: String(NOW_MS / 1000),
      public_id: publicId,
      allowed_formats: "jpg,png,webp,heic,heif",
      overwrite: "false",
      // Authenticated, so the untransformed original (with its EXIF and GPS) is never publicly fetchable.
      type: "authenticated",
      // Embedded EXIF and the predominant colors, read back on the server by createMemory.
      media_metadata: "true",
      colors: "true",
    })
    // The signature covers every field but the API key and itself, with the API secret.
    const { api_key: apiKey, signature, ...signed } = upload.photo!
    expect(apiKey).toBe("123456")
    expect(signature).toBe(signCloudinaryParams(signed, API_SECRET))
  })

  it("signs exactly the documented parameter string, with the new fields, as Cloudinary expects", async () => {
    const { full } = deps()
    const result = await prepareUploadWith(full, PHOTO)
    if (!result.ok) throw new Error("expected ok")
    const { signature, api_key, ...signed } = result.upload.photo!
    expect(api_key).toBe("123456")
    const toSign = [
      "allowed_formats=jpg,png,webp,heic,heif",
      "colors=true",
      "media_metadata=true",
      "overwrite=false",
      `public_id=my-life/memories/${ID}`,
      `timestamp=${NOW_MS / 1000}`,
      "type=authenticated",
    ].join("&")
    expect(serializeParams(signed)).toBe(toSign)
    expect(signature).toBe(createHash("sha256").update(`${toSign}${API_SECRET}`).digest("hex"))
  })

  it("returns a ticket bound to the handle and the public id, valid for 15 minutes", async () => {
    const { full } = deps()
    const result = await prepareUploadWith(full, PHOTO)
    if (!result.ok) throw new Error("expected ok")
    const nowSec = NOW_MS / 1000
    expect(verifyUploadTicket(result.upload.ticket, SECRET, nowSec)).toEqual({
      h: "ana",
      pid: `my-life/memories/${ID}`,
      exp: nowSec + 3600,
    })
    expect(verifyUploadTicket(result.upload.ticket, SECRET, nowSec + 3600)).toBeNull()
  })

  it("never leaks the API secret or the session secret", async () => {
    const { full } = deps()
    const json = JSON.stringify(await prepareUploadWith(full, PHOTO))
    expect(json).not.toContain(API_SECRET)
    expect(json).not.toContain(SECRET)
  })
})

describe("prepareUploadWith: audio", () => {
  const ids = [ID, AUDIO_ID]
  const withIds = () => {
    let n = 0
    return { newId: () => ids[n++ % ids.length] }
  }
  const AUDIO_PUBLIC_ID = `my-life/memories/audio-${AUDIO_ID}`

  it("signs an audio upload with a server-chosen id, audio formats only, no overwrite and the authenticated type", async () => {
    const { full } = deps(withIds())
    const result = await prepareUploadWith(full, VOICE)
    if (!result.ok) throw new Error("expected ok")
    expect(result.upload.photo).toBeNull()
    const audio = result.upload.audio
    if (!audio) throw new Error("expected audio fields")
    expect(audio).toMatchObject({
      api_key: "123456",
      timestamp: String(NOW_MS / 1000),
      public_id: `my-life/memories/audio-${ID}`,
      allowed_formats: "webm,ogg,opus,mp3,m4a,mp4,aac,wav",
      overwrite: "false",
      type: "authenticated",
    })
    // The photo-only extractions (EXIF, colors) make no sense for audio.
    expect(audio).not.toHaveProperty("colors")
    expect(audio).not.toHaveProperty("media_metadata")
    const { api_key, signature, ...signed } = audio
    expect(api_key).toBe("123456")
    expect(signature).toBe(signCloudinaryParams(signed, API_SECRET))
    expect(serializeParams(signed)).toBe(
      [
        "allowed_formats=webm,ogg,opus,mp3,m4a,mp4,aac,wav",
        "eager=f_mp3",
        "eager_async=true",
        "overwrite=false",
        `public_id=my-life/memories/audio-${ID}`,
        `timestamp=${NOW_MS / 1000}`,
        "type=authenticated",
      ].join("&"),
    )
  })

  it("asks Cloudinary to make the playable mp3 once, at upload, in the background (eager + eager_async)", async () => {
    const { full } = deps(withIds())
    const result = await prepareUploadWith(full, VOICE)
    if (!result.ok || !result.upload.audio) throw new Error("expected audio fields")
    // The same transformation the delivery URL is signed with, so the eager derivative is the one that is served.
    expect(result.upload.audio.eager).toBe(AUDIO_TRANSFORM)
    expect(result.upload.audio.eager_async).toBe("true")
  })

  it("signs the eager params as Cloudinary does: raw, unencoded, sorted with the rest, SHA-256 of the string plus the secret", async () => {
    const { full } = deps(withIds())
    const result = await prepareUploadWith(full, VOICE)
    if (!result.ok || !result.upload.audio) throw new Error("expected audio fields")
    const toSign = `allowed_formats=webm,ogg,opus,mp3,m4a,mp4,aac,wav&eager=f_mp3&eager_async=true&overwrite=false&public_id=my-life/memories/audio-${ID}&timestamp=${NOW_MS / 1000}&type=authenticated${API_SECRET}`
    expect(result.upload.audio.signature).toBe(createHash("sha256").update(toSign).digest("hex"))
  })

  it("does not ask for eager derivatives of a photo", async () => {
    const { full } = deps(withIds())
    const result = await prepareUploadWith(full, BOTH)
    if (!result.ok || !result.upload.photo) throw new Error("expected photo fields")
    expect(result.upload.photo).not.toHaveProperty("eager")
    expect(result.upload.photo).not.toHaveProperty("eager_async")
  })

  it("signs both a photo and an audio, under two different ids, with one ticket covering both", async () => {
    const { full } = deps(withIds())
    const result = await prepareUploadWith(full, BOTH)
    if (!result.ok) throw new Error("expected ok")
    const { photo, audio, ticket } = result.upload
    expect(photo?.public_id).toBe(`my-life/memories/${ID}`)
    expect(audio?.public_id).toBe(AUDIO_PUBLIC_ID)
    expect(photo?.public_id).not.toBe(audio?.public_id)
    const nowSec = NOW_MS / 1000
    expect(verifyUploadTicket(ticket, SECRET, nowSec)).toEqual({
      h: "ana",
      pid: `my-life/memories/${ID}`,
      aid: AUDIO_PUBLIC_ID,
      exp: nowSec + 3600,
    })
  })

  it("issues a ticket with no photo id for an audio-only upload", async () => {
    const { full } = deps(withIds())
    const result = await prepareUploadWith(full, VOICE)
    if (!result.ok) throw new Error("expected ok")
    const ticket = verifyUploadTicket(result.upload.ticket, SECRET, NOW_MS / 1000)
    expect(ticket).toEqual({ h: "ana", aid: `my-life/memories/audio-${ID}`, exp: NOW_MS / 1000 + 3600 })
  })

  it("keeps a photo-only grant free of audio fields", async () => {
    const { full } = deps(withIds())
    const result = await prepareUploadWith(full, PHOTO)
    if (!result.ok) throw new Error("expected ok")
    expect(result.upload.audio).toBeNull()
    expect(verifyUploadTicket(result.upload.ticket, SECRET, NOW_MS / 1000)).not.toHaveProperty("aid")
  })

  it.each([
    ["nothing", { photo: false, audio: false }],
    ["no input", undefined],
    ["a value that is not an object", "audio"],
    ["truthy values that are not the boolean true", { photo: 1, audio: "yes" }],
  ])("answers invalid for %s, touching nothing", async (_name, input) => {
    const { full, repository } = deps()
    expect(await prepareUploadWith(full, input as never)).toEqual({ ok: false, reason: "invalid" })
    expect(repository.countRecentBy).not.toHaveBeenCalled()
  })

  it("applies the rate limit to an audio upload too", async () => {
    const { full } = deps(withIds(), 5)
    expect(await prepareUploadWith(full, VOICE)).toEqual({ ok: false, reason: "rate_limited" })
  })

  it("never leaks the API secret in an audio grant", async () => {
    const { full } = deps(withIds())
    expect(JSON.stringify(await prepareUploadWith(full, BOTH))).not.toContain(API_SECRET)
  })
})
