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
