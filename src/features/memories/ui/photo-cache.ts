import type { PhotoSize } from "../photo-ladder"

export type PhotoLoader = (url: string) => Promise<HTMLImageElement>
export type GlassSource = ImageBitmap | HTMLImageElement

export interface PhotoCache {
  /** Decoded and ready to paint, with no decode left for a frame to pay. */
  isDecoded: (url: string) => boolean
  /** The decoded image, or null (and a use: it is the most recently used now). */
  get: (url: string) => HTMLImageElement | null
  /** Loads and decodes one URL, once however often it is asked. Rejects when it cannot be loaded. */
  load: (url: string) => Promise<HTMLImageElement>
  /**
   * Warms sizes in order, each once the one before has landed (or failed): the small one arrives first and the big one
   * follows. Sizes already warm or on their way are not asked for again.
   */
  warm: (sizes: readonly PhotoSize[]) => void
  /** Takes a photo an element already loaded (an orb's own `<img>`): it counts as decoded once its decode is done. */
  adopt: (url: string, img: HTMLImageElement) => void
  /** The photo for a WebGL texture: an ImageBitmap decoded off the main thread where possible, else the image. */
  bitmap: (url: string) => Promise<GlassSource>
  /** Called with the URL each time a photo finishes decoding. */
  subscribe: (listener: (url: string) => void) => () => void
}

interface Options {
  load?: PhotoLoader
  /** How many decoded photos are kept (the least recently used go first). */
  capacity?: number
}

/**
 * An image that is fetched with CORS (the glass reads it into WebGL) and decoded before it is handed over, so putting
 * it on screen never stalls a frame on a decode.
 */
export async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.crossOrigin = "anonymous"
  img.decoding = "async"
  img.src = url
  await img.decode()
  return img
}

const BITMAP_OPTIONS: ImageBitmapOptions = {
  // Cloudinary already writes the pixels upright; this keeps any EXIF turn the browser knows about.
  imageOrientation: "from-image",
  // The shader does its own blending; straight alpha keeps the colors exact.
  premultiplyAlpha: "none",
  colorSpaceConversion: "default",
}

/**
 * The decoded photos of the memories space, shared by the orbs, the approach and the glass. Everything that shows a
 * photo asks here first, so a size is fetched and decoded once and every view swaps to it only once it is ready.
 */
export function createPhotoCache({ load = loadImage, capacity = 48 }: Options = {}): PhotoCache {
  const decoded = new Map<string, HTMLImageElement>()
  const inflight = new Map<string, Promise<HTMLImageElement>>()
  const bitmaps = new Map<string, Promise<GlassSource>>()
  const listeners = new Set<(url: string) => void>()

  const touch = (url: string, img: HTMLImageElement) => {
    decoded.delete(url)
    decoded.set(url, img)
    while (decoded.size > capacity) {
      const oldest = decoded.keys().next().value as string
      decoded.delete(oldest)
      const bitmap = bitmaps.get(oldest)
      bitmaps.delete(oldest)
      void bitmap?.then((b) => ("close" in b ? b.close() : undefined), () => {})
    }
  }

  const landed = (url: string, img: HTMLImageElement) => {
    inflight.delete(url)
    touch(url, img)
    for (const listener of [...listeners]) listener(url)
    return img
  }

  const loadOne = (url: string): Promise<HTMLImageElement> => {
    const ready = decoded.get(url)
    if (ready) {
      touch(url, ready)
      return Promise.resolve(ready)
    }
    const running = inflight.get(url)
    if (running) return running
    const next = load(url).then(
      (img) => landed(url, img),
      (error: unknown) => {
        inflight.delete(url)
        throw error
      },
    )
    inflight.set(url, next)
    return next
  }

  return {
    isDecoded: (url) => decoded.has(url),
    get: (url) => {
      const img = decoded.get(url)
      if (!img) return null
      touch(url, img)
      return img
    },
    load: loadOne,
    adopt: (url, img) => {
      if (decoded.has(url) || inflight.has(url)) return
      const decoding = (typeof img.decode === "function" ? img.decode() : Promise.resolve()).then(
        () => landed(url, img),
        (error: unknown) => {
          inflight.delete(url)
          throw error
        },
      )
      inflight.set(url, decoding)
      decoding.catch(() => {})
    },
    warm: (sizes) => {
      const queue = sizes.filter((size) => !decoded.has(size.url))
      // The first request leaves now, in the same task as the intent that asked for it.
      const run = (i: number) => {
        if (i >= queue.length) return
        void loadOne(queue[i].url)
          .catch(() => null)
          .then(() => run(i + 1))
      }
      run(0)
    },
    bitmap: (url) => {
      const known = bitmaps.get(url)
      if (known) return known
      const made = loadOne(url).then((img) =>
        typeof createImageBitmap === "function" ? createImageBitmap(img, BITMAP_OPTIONS).catch(() => img) : img,
      )
      bitmaps.set(url, made)
      made.catch(() => bitmaps.delete(url))
      return made
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
