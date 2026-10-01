import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { CloudinaryAdminAssets } from "./cloudinary-admin-assets"

const config = { cloudName: "demo", apiKey: "key", apiSecret: "secret" }
const ID = "my-life/memories/3f2b8c1e-6d4a-4f3b-9c1d-0a1b2c3d4e5f"
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

afterEach(() => vi.restoreAllMocks())

describe("CloudinaryAdminAssets.describe", () => {
  it("reads the resource over the Admin API with basic auth and maps its fields", async () => {
    const fetchMock = vi.fn(async () =>
      json(200, { public_id: ID, resource_type: "image", type: "authenticated", format: "jpg", bytes: 1234, width: 800, height: 600, secret: "x" }),
    )
    const info = await new CloudinaryAdminAssets(config, fetchMock as never).describe(ID)
    expect(info).toEqual({
      publicId: ID,
      resourceType: "image",
      type: "authenticated",
      format: "jpg",
      bytes: 1234,
      width: 800,
      height: 600,
      imageMetadata: undefined,
      colors: undefined,
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.cloudinary.com/v1_1/demo/resources/image/authenticated/my-life/memories/3f2b8c1e-6d4a-4f3b-9c1d-0a1b2c3d4e5f?media_metadata=true&colors=true`)
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("key:secret").toString("base64")}`)
    expect(init.method ?? "GET").toBe("GET")
  })

  it("asks for the embedded metadata and the colors, and returns them from the original", async () => {
    const colors = [["#112233", 40]]
    const metadata = { Make: "Apple", GPSLatitude: "40 deg 42' 46.08\" N" }
    const base = { public_id: ID, resource_type: "image", type: "authenticated", format: "jpg", bytes: 1, width: 2, height: 3 }
    const a = await new CloudinaryAdminAssets(config, (async () => json(200, { ...base, image_metadata: metadata, colors })) as never).describe(ID)
    expect(a).toMatchObject({ imageMetadata: metadata, colors })
    // The response key is `media_metadata` in some answers; either is read.
    const b = await new CloudinaryAdminAssets(config, (async () => json(200, { ...base, media_metadata: metadata })) as never).describe(ID)
    expect(b).toMatchObject({ imageMetadata: metadata })
  })

  it("ignores metadata that is not an object", async () => {
    const base = { public_id: ID, resource_type: "image", type: "authenticated", format: "jpg", bytes: 1, width: 2, height: 3 }
    const info = await new CloudinaryAdminAssets(config, (async () => json(200, { ...base, image_metadata: "x" })) as never).describe(ID)
    expect(info?.imageMetadata).toBeUndefined()
  })

  it("never puts the metadata in an error", async () => {
    const fetchMock = vi.fn(async () => json(500, { image_metadata: { GPSLatitude: "40.1" } }))
    await expect(new CloudinaryAdminAssets(config, fetchMock as never).describe(ID)).rejects.not.toThrow(/GPS/)
  })

  it("is null when the asset does not exist", async () => {
    const fetchMock = vi.fn(async () => json(404, { error: { message: "Resource not found" } }))
    expect(await new CloudinaryAdminAssets(config, fetchMock as never).describe(ID)).toBeNull()
  })

  it("throws on any other failure, without echoing the response", async () => {
    const fetchMock = vi.fn(async () => json(500, { error: { message: "secret detail" } }))
    await expect(new CloudinaryAdminAssets(config, fetchMock as never).describe(ID)).rejects.toThrow(/500/)
    await expect(new CloudinaryAdminAssets(config, fetchMock as never).describe(ID)).rejects.not.toThrow(/secret detail/)
  })

  it("refuses a public id that could walk out of its path", async () => {
    const fetchMock = vi.fn()
    await expect(new CloudinaryAdminAssets(config, fetchMock as never).describe("a/../b")).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws when the answer is not shaped like an asset", async () => {
    const fetchMock = vi.fn(async () => json(200, { public_id: ID }))
    await expect(new CloudinaryAdminAssets(config, fetchMock as never).describe(ID)).rejects.toThrow()
  })
})

describe("CloudinaryAdminAssets.destroy", () => {
  it("deletes the one resource and invalidates the CDN copy", async () => {
    const fetchMock = vi.fn(async () => json(200, { deleted: { [ID]: "deleted" } }))
    await new CloudinaryAdminAssets(config, fetchMock as never).destroy(ID)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api.cloudinary.com/v1_1/demo/resources/image/authenticated")
    expect(init.method).toBe("DELETE")
    const body = new URLSearchParams(String(init.body))
    expect(body.getAll("public_ids[]")).toEqual([ID])
    expect(body.get("invalidate")).toBe("true")
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /)
  })

  it("throws when Cloudinary refuses", async () => {
    const fetchMock = vi.fn(async () => json(401, {}))
    await expect(new CloudinaryAdminAssets(config, fetchMock as never).destroy(ID)).rejects.toThrow(/401/)
  })
})

describe("CloudinaryAdminAssets.describeAudio", () => {
  const AID = "my-life/memories/audio-3f2b8c1e-6d4a-4f3b-9c1d-0a1b2c3d4e5f"
  const body = {
    public_id: AID,
    resource_type: "video",
    type: "authenticated",
    format: "webm",
    bytes: 4321,
    duration: 12.345,
    is_audio: true,
    audio: { codec: "opus" },
  }

  it("reads the video-type resource over the Admin API and maps the audio fields", async () => {
    const fetchMock = vi.fn(async () => json(200, { ...body, secret: "x" }))
    const info = await new CloudinaryAdminAssets(config, fetchMock as never).describeAudio(AID)
    expect(info).toEqual({
      publicId: AID,
      resourceType: "video",
      type: "authenticated",
      format: "webm",
      bytes: 4321,
      durationSeconds: 12.345,
      isAudio: true,
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.cloudinary.com/v1_1/demo/resources/video/authenticated/${AID}?media_metadata=true`)
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("key:secret").toString("base64")}`)
  })

  it("says the asset is audio when Cloudinary reports an audio stream and no video stream", async () => {
    const { is_audio: _omit, ...noFlag } = body
    void _omit
    const audioOnly = await new CloudinaryAdminAssets(config, (async () => json(200, noFlag)) as never).describeAudio(AID)
    expect(audioOnly?.isAudio).toBe(true)
    const withPictures = await new CloudinaryAdminAssets(
      config,
      (async () => json(200, { ...noFlag, video: { codec: "vp8" } })) as never,
    ).describeAudio(AID)
    expect(withPictures?.isAudio).toBe(false)
  })

  it("trusts an explicit is_audio over the streams", async () => {
    const info = await new CloudinaryAdminAssets(
      config,
      (async () => json(200, { ...body, is_audio: false })) as never,
    ).describeAudio(AID)
    expect(info?.isAudio).toBe(false)
  })

  // What the Admin API really answered for a 3 s webm recorded by Chrome's MediaRecorder (observed, trimmed): the
  // container is reported as `mka` (Matroska audio) and the audio flags live in `video_metadata`, not at the top.
  const recorded = {
    public_id: AID,
    resource_type: "video",
    type: "authenticated",
    format: "mka",
    bytes: 40666,
    width: 0,
    height: 0,
    audio_codec: "opus",
    audio_frequency: 48000,
    channels: 1,
    has_audio: true,
    duration: 2.94,
    video_metadata: {
      width: 0,
      height: 0,
      has_audio: true,
      format: "mka",
      duration: 2.94,
      audio: { codec: "opus", frequency: 48000, channels: 1, channel_layout: "mono" },
      video: {},
      is_audio: true,
    },
  }

  it("reads the audio flag Cloudinary nests in video_metadata (a recorded webm is reported as mka)", async () => {
    const info = await new CloudinaryAdminAssets(config, (async () => json(200, recorded)) as never).describeAudio(AID)
    expect(info).toEqual({
      publicId: AID,
      resourceType: "video",
      type: "authenticated",
      format: "mka",
      bytes: 40666,
      durationSeconds: 2.94,
      isAudio: true,
    })
  })

  it("does not call a video audio when video_metadata says it is not, or reports a video codec", async () => {
    const notAudio = { ...recorded, video_metadata: { ...recorded.video_metadata, is_audio: false } }
    expect(
      (await new CloudinaryAdminAssets(config, (async () => json(200, notAudio)) as never).describeAudio(AID))?.isAudio,
    ).toBe(false)
    const { is_audio: _omit, ...noFlag } = recorded.video_metadata
    void _omit
    const withPictures = { ...recorded, video_codec: "vp8", video_metadata: noFlag }
    expect(
      (await new CloudinaryAdminAssets(config, (async () => json(200, withPictures)) as never).describeAudio(AID))?.isAudio,
    ).toBe(false)
  })

  it("falls back to has_audio with no video stream when no is_audio flag is anywhere", async () => {
    const { is_audio: _omit, ...noFlag } = recorded.video_metadata
    void _omit
    const info = await new CloudinaryAdminAssets(
      config,
      (async () => json(200, { ...recorded, video_metadata: noFlag })) as never,
    ).describeAudio(AID)
    expect(info?.isAudio).toBe(true)
  })

  it("reads a missing duration as null", async () => {
    const { duration: _omit, ...noDuration } = body
    void _omit
    const info = await new CloudinaryAdminAssets(config, (async () => json(200, noDuration)) as never).describeAudio(AID)
    expect(info?.durationSeconds).toBeNull()
  })

  it("is null when the asset does not exist, and throws on any other failure without echoing it", async () => {
    expect(await new CloudinaryAdminAssets(config, (async () => json(404, {})) as never).describeAudio(AID)).toBeNull()
    const failing = vi.fn(async () => json(500, { error: { message: "secret detail" } }))
    await expect(new CloudinaryAdminAssets(config, failing as never).describeAudio(AID)).rejects.toThrow(/500/)
    await expect(new CloudinaryAdminAssets(config, failing as never).describeAudio(AID)).rejects.not.toThrow(/secret detail/)
  })

  it("refuses a public id that could walk out of its path, and an answer that is not shaped like an asset", async () => {
    const fetchMock = vi.fn()
    await expect(new CloudinaryAdminAssets(config, fetchMock as never).describeAudio("a/../b")).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(
      new CloudinaryAdminAssets(config, (async () => json(200, { public_id: AID })) as never).describeAudio(AID),
    ).rejects.toThrow()
  })
})

describe("CloudinaryAdminAssets.destroyAudio", () => {
  it("deletes the one video-type resource and invalidates the CDN copy", async () => {
    const fetchMock = vi.fn(async () => json(200, { deleted: {} }))
    await new CloudinaryAdminAssets(config, fetchMock as never).destroyAudio(ID)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api.cloudinary.com/v1_1/demo/resources/video/authenticated")
    expect(init.method).toBe("DELETE")
    const form = new URLSearchParams(String(init.body))
    expect(form.getAll("public_ids[]")).toEqual([ID])
    expect(form.get("invalidate")).toBe("true")
  })

  it("throws when Cloudinary refuses", async () => {
    await expect(
      new CloudinaryAdminAssets(config, (async () => json(401, {})) as never).destroyAudio(ID),
    ).rejects.toThrow(/401/)
  })
})
