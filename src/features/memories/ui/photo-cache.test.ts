import { afterEach, describe, expect, it, vi } from "vitest"
import { createPhotoCache, loadImage } from "./photo-cache"

/** A loader whose loads finish only when the test says so. */
function controlledLoader() {
  const pending = new Map<string, { resolve: (img: HTMLImageElement) => void; reject: (e: Error) => void }>()
  const calls: string[] = []
  const load = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      calls.push(url)
      pending.set(url, { resolve, reject })
    })
  const finish = async (url: string) => {
    const img = document.createElement("img")
    img.dataset.url = url
    pending.get(url)?.resolve(img)
    // Let every promise hop settle (a warm chains a few).
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  const fail = async (url: string) => {
    pending.get(url)?.reject(new Error("no"))
    // Let every promise hop settle (a warm chains a few).
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { load, calls, finish, fail }
}

const size = (width: number) => ({ width, url: `u${width}` })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("the photo cache", () => {
  it("loads a URL once, however many times it is asked for", async () => {
    const loader = controlledLoader()
    const cache = createPhotoCache({ load: loader.load })
    const a = cache.load("u96")
    const b = cache.load("u96")
    expect(loader.calls).toEqual(["u96"])
    await loader.finish("u96")
    expect(await a).toBe(await b)
  })

  it("only calls a photo decoded once it can be painted without a decode on the frame", async () => {
    const loader = controlledLoader()
    const cache = createPhotoCache({ load: loader.load })
    void cache.load("u96")
    expect(cache.isDecoded("u96")).toBe(false)
    expect(cache.get("u96")).toBeNull()
    await loader.finish("u96")
    expect(cache.isDecoded("u96")).toBe(true)
    expect(cache.get("u96")?.dataset.url).toBe("u96")
  })

  it("warms sizes smallest first: the next one starts once the one before has landed", async () => {
    const loader = controlledLoader()
    const cache = createPhotoCache({ load: loader.load })
    cache.warm([size(384), size(1600)])
    expect(loader.calls).toEqual(["u384"])
    await loader.finish("u384")
    expect(loader.calls).toEqual(["u384", "u1600"])
  })

  it("does not ask again for what is already warm or on its way", async () => {
    const loader = controlledLoader()
    const cache = createPhotoCache({ load: loader.load })
    cache.warm([size(384), size(1600)])
    cache.warm([size(384), size(1600)])
    await loader.finish("u384")
    cache.warm([size(384), size(1600)])
    await loader.finish("u1600")
    expect(loader.calls).toEqual(["u384", "u1600"])
  })

  it("moves on when a size fails, and never calls it decoded", async () => {
    const loader = controlledLoader()
    const cache = createPhotoCache({ load: loader.load })
    const seen: string[] = []
    cache.subscribe((url) => seen.push(url))
    cache.warm([size(384), size(1600)])
    await loader.fail("u384")
    expect(cache.isDecoded("u384")).toBe(false)
    expect(loader.calls).toEqual(["u384", "u1600"])
    await loader.finish("u1600")
    expect(seen).toEqual(["u1600"])
  })

  it("tells its listeners each time a photo is decoded, until they leave", async () => {
    const loader = controlledLoader()
    const cache = createPhotoCache({ load: loader.load })
    const seen: string[] = []
    const stop = cache.subscribe((url) => seen.push(url))
    void cache.load("u96")
    await loader.finish("u96")
    stop()
    void cache.load("u192")
    await loader.finish("u192")
    expect(seen).toEqual(["u96"])
  })

  it("adopts a photo an orb already loaded, once it is decoded, so nothing fetches it twice", async () => {
    const loader = controlledLoader()
    const cache = createPhotoCache({ load: loader.load })
    const seen: string[] = []
    cache.subscribe((url) => seen.push(url))
    const img = document.createElement("img")
    let decoded = () => {}
    img.decode = () => new Promise<void>((resolve) => (decoded = resolve))
    cache.adopt("u96", img)
    expect(cache.isDecoded("u96")).toBe(false)
    decoded()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(cache.get("u96")).toBe(img)
    expect(seen).toEqual(["u96"])
    void cache.load("u96")
    expect(loader.calls).toEqual([])
  })

  it("forgets the least recently used photos beyond its capacity", async () => {
    const loader = controlledLoader()
    const cache = createPhotoCache({ load: loader.load, capacity: 2 })
    for (const url of ["a", "b"]) {
      void cache.load(url)
      await loader.finish(url)
    }
    cache.get("a") // "a" was used again, so "b" is the oldest
    void cache.load("c")
    await loader.finish("c")
    expect(cache.isDecoded("a")).toBe(true)
    expect(cache.isDecoded("b")).toBe(false)
    expect(cache.isDecoded("c")).toBe(true)
  })
})

describe("a bitmap for the glass", () => {
  it("decodes it off the main thread, upright, unpremultiplied and color managed", async () => {
    const loader = controlledLoader()
    const bitmap = { width: 8, height: 8, close: vi.fn() }
    const create = vi.fn(async () => bitmap)
    vi.stubGlobal("createImageBitmap", create)
    const cache = createPhotoCache({ load: loader.load })
    const pending = cache.bitmap("u1600")
    await loader.finish("u1600")
    expect(await pending).toBe(bitmap)
    expect(create).toHaveBeenCalledWith(expect.any(HTMLImageElement), {
      imageOrientation: "from-image",
      premultiplyAlpha: "none",
      colorSpaceConversion: "default",
    })
    // Asked again, the same bitmap comes back: it is made once.
    expect(await cache.bitmap("u1600")).toBe(bitmap)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("hands over the decoded image itself where there is no createImageBitmap", async () => {
    const loader = controlledLoader()
    vi.stubGlobal("createImageBitmap", undefined)
    const cache = createPhotoCache({ load: loader.load })
    const pending = cache.bitmap("u768")
    await loader.finish("u768")
    expect((await pending) as HTMLImageElement).toBe(cache.get("u768"))
  })
})

describe("loading an image", () => {
  it("asks for it with CORS (WebGL and the canvas read it) and waits until it is decoded", async () => {
    const made: Array<{ crossOrigin: string | null; decoding: string; src: string; decode: () => Promise<void> }> = []
    class FakeImage {
      crossOrigin: string | null = null
      decoding = "auto"
      src = ""
      decode = vi.fn(async () => {})
      constructor() {
        made.push(this)
      }
    }
    vi.stubGlobal("Image", FakeImage)
    const img = await loadImage("https://res.cloudinary.com/x/1600")
    expect(made).toHaveLength(1)
    expect(made[0].crossOrigin).toBe("anonymous")
    expect(made[0].decoding).toBe("async")
    expect(made[0].src).toBe("https://res.cloudinary.com/x/1600")
    expect(made[0].decode).toHaveBeenCalled()
    expect(img).toBe(made[0])
  })
})
