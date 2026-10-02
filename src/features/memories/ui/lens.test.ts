import { describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import { PHOTO_RUNGS } from "../photo-ladder"
import { GLASS_OPEN_MS, GLASS_RELEASE_MS, chase, createLens, glassAt, switchMixTarget } from "./lens"
import type { GlassRenderer, LensSlot } from "./glass-renderer"
import type { PhotoCache } from "./photo-cache"

const memory = (id: string, over: Partial<MemoryView> = {}): MemoryView => ({
  id,
  caption: id,
  happenedOn: "2024-01-01",
  status: "approved",
  width: 1600,
  height: 1600,
  kind: "image",
  takenAt: null,
  dominantColor: null,
  place: null,
  orbColor: "#8ab4ff",
  thumbUrl: `${id}-t`,
  fullUrl: `${id}-f`,
  photo: { sizes: PHOTO_RUNGS.map((width) => ({ width, url: `${id}-${width}` })) },
  audio: null,
  ...over,
})
const voice = (id: string) =>
  memory(id, { photo: null, thumbUrl: null, fullUrl: null, width: null, height: null, audio: { url: "a", durationMs: 1 }, orbColor: "#ff9a3c" })

/** A renderer that records what it is asked to draw. */
function fakeRenderer() {
  let n = 0
  const textures = new Map<object, string>()
  const draws: Array<{ a: LensSlot; b: LensSlot | null; mix: number; glass: number; warp: number; time: number; fog: number }> = []
  const renderer = {
    texture: vi.fn((source: { url: string }) => {
      const t = { id: ++n }
      textures.set(t, source.url)
      return t as unknown as WebGLTexture
    }),
    release: vi.fn(),
    collapse: vi.fn<GlassRenderer["collapse"]>(() => {
      const t = { id: ++n }
      textures.set(t, "collapsed")
      return t as unknown as WebGLTexture
    }),
    resize: vi.fn(),
    clear: vi.fn(),
    draw: vi.fn((a: LensSlot, b: LensSlot | null, frame: { mix: number; glass: number; warp: number; time: number; fog: number }) => {
      draws.push({ a, b, ...frame })
    }),
    dispose: vi.fn(),
  }
  const nameOf = (slot: LensSlot | null) => (slot?.texture ? textures.get(slot.texture as object) : slot ? "voice" : null)
  return { renderer: renderer as unknown as GlassRenderer & typeof renderer, draws, nameOf }
}

/** A cache whose bitmaps resolve when the test lets them. */
function fakeCache(decoded: string[] = []) {
  const ready = new Set(decoded)
  const pending = new Map<string, (b: unknown) => void>()
  const cache = {
    isDecoded: (url: string) => ready.has(url),
    get: () => null,
    load: vi.fn(),
    adopt: vi.fn(),
    warm: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    bitmap: vi.fn((url: string) => {
      if (ready.has(url)) return Promise.resolve({ url, width: 1, height: 1 })
      return new Promise((resolve) => pending.set(url, resolve))
    }),
  }
  const land = async (url: string) => {
    ready.add(url)
    pending.get(url)?.({ url, width: 1, height: 1 })
    await flush()
  }
  return { cache: cache as unknown as PhotoCache & typeof cache, land }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A lens on a 2x screen with a 558 px sphere, whose upload tasks run when the test says. */
function setup(decoded: string[] = []) {
  const { renderer, draws, nameOf } = fakeRenderer()
  const { cache, land } = fakeCache(decoded)
  const tasks: Array<() => void> = []
  const lens = createLens({
    cache,
    createRenderer: () => renderer,
    schedule: (task) => tasks.push(task),
    canvas: document.createElement("canvas"),
  })
  lens.prepare()
  lens.resize({ device: 1206, deviceDiameter: 1116, diameter: 558, dpr: 2 })
  const runTasks = () => {
    while (tasks.length) tasks.shift()!()
  }
  const frame = (now: number, input: Partial<{ level: number; reduced: boolean; travel: number | null }> = {}) =>
    lens.frame(now, { level: 0, reduced: false, travel: null, ...input })
  return { lens, renderer, draws, nameOf, cache, land, tasks, runTasks, frame }
}

describe("the glass ramps", () => {
  it("condenses out of the flat orb on a strong ease-out, and melts back faster", () => {
    expect(glassAt({ from: 0, to: 1, start: 0 }, 0, false)).toBe(0)
    expect(glassAt({ from: 0, to: 1, start: 0 }, GLASS_OPEN_MS * 0.25, false)).toBeGreaterThan(0.6)
    expect(glassAt({ from: 0, to: 1, start: 0 }, GLASS_OPEN_MS, false)).toBe(1)
    expect(GLASS_RELEASE_MS).toBeLessThan(GLASS_OPEN_MS)
    expect(glassAt({ from: 1, to: 0, start: 100 }, 100 + GLASS_RELEASE_MS, false)).toBe(0)
  })

  it("is the full glass at once under reduced motion: the canvas crossfades in instead", () => {
    expect(glassAt({ from: 0, to: 1, start: 0 }, 0, true)).toBe(1)
    expect(glassAt({ from: 1, to: 0, start: 0 }, 0, true)).toBe(0)
  })
})

describe("the dissolve", () => {
  it("chases its target smoothly, whatever the frame rate", () => {
    const oneStep = chase(0, 1, 0.1, 0.09)
    let two = chase(0, 1, 0.05, 0.09)
    two = chase(two, 1, 0.05, 0.09)
    expect(two).toBeCloseTo(oneStep, 9)
    expect(oneStep).toBeGreaterThan(0)
    expect(oneStep).toBeLessThan(1)
  })

  it("waits for the next photo, then follows the camera across the switch", () => {
    expect(switchMixTarget(0.5, false, false)).toBe(0)
    expect(switchMixTarget(0, true, false)).toBe(0)
    expect(switchMixTarget(0.4, true, false)).toBeGreaterThan(0)
    expect(switchMixTarget(0.4, true, false)).toBeLessThan(1)
    expect(switchMixTarget(1, true, false)).toBe(1)
    // Landed (no travel left to follow): all the way.
    expect(switchMixTarget(null, true, false)).toBe(1)
  })

  it("is a plain crossfade under reduced motion, with no travel to follow", () => {
    expect(switchMixTarget(0, true, true)).toBe(1)
  })
})

describe("the lens", () => {
  it("draws nothing until it has a photo, so the orb's disc under it shows instead of a blank", () => {
    const { lens, renderer, frame } = setup()
    lens.show(memory("a"))
    lens.open(0)
    frame(16)
    expect(renderer.draw).not.toHaveBeenCalled()
  })

  it("uploads photos in a task of their own, never on a frame", async () => {
    const { lens, renderer, frame, runTasks, land } = setup(["a-384"])
    lens.show(memory("a"))
    await flush()
    frame(0)
    expect(renderer.texture).not.toHaveBeenCalled()
    runTasks()
    expect(renderer.texture).toHaveBeenCalledTimes(1)
    await land("a-1600")
    frame(16)
    expect(renderer.texture).toHaveBeenCalledTimes(1)
    runTasks()
    expect(renderer.texture).toHaveBeenCalledTimes(2)
  })

  it("opens on the best photo it has and fades the sharp one in when it is ready", async () => {
    const { lens, draws, nameOf, frame, runTasks, land } = setup(["a-384"])
    lens.show(memory("a"))
    lens.open(0)
    await flush()
    runTasks()
    frame(16)
    expect(nameOf(draws.at(-1)!.a)).toBe("a-384")
    await land("a-1600")
    runTasks()
    frame(32)
    const fading = draws.at(-1)!
    expect(nameOf(fading.a)).toBe("a-384")
    expect(nameOf(fading.b)).toBe("a-1600")
    // Only sharpening: no fog, it just comes into focus.
    expect(fading.fog).toBe(0)
    for (let t = 48; t < 1200; t += 16) frame(t)
    expect(nameOf(draws.at(-1)!.a)).toBe("a-1600")
    expect(draws.at(-1)!.b).toBeNull()
  })

  it("starts the glass ramp only once there is something to show, so it never pops in half way", async () => {
    const { lens, draws, frame, runTasks, land } = setup()
    lens.show(memory("a"))
    lens.open(0)
    frame(300)
    await land("a-1600")
    runTasks()
    frame(316)
    expect(draws.at(-1)!.glass).toBeLessThan(0.3)
  })

  it("dissolves to the next memory as the camera carries the world across", async () => {
    const { lens, draws, nameOf, frame, runTasks } = setup(["a-1600", "b-1600"])
    lens.show(memory("a"))
    lens.open(0)
    await flush()
    runTasks()
    frame(500)
    lens.show(memory("b"))
    await flush()
    runTasks()
    frame(516, { travel: 0 })
    expect(draws.at(-1)!.mix).toBe(0)
    for (let t = 532; t < 700; t += 16) frame(t, { travel: 0.4 })
    const mid = draws.at(-1)!
    expect(nameOf(mid.a)).toBe("a-1600")
    expect(nameOf(mid.b)).toBe("b-1600")
    expect(mid.mix).toBeGreaterThan(0.2)
    expect(mid.mix).toBeLessThan(0.8)
    // The glass fogs a little while it changes memory, which hides the double image of a plain crossfade.
    expect(mid.fog).toBe(1)
    for (let t = 700; t < 1400; t += 16) frame(t, { travel: t > 1000 ? null : 1 })
    expect(nameOf(draws.at(-1)!.a)).toBe("b-1600")
  })

  it("retargets mid-dissolve from what is on screen: it blends it into one texture, so nothing jumps", async () => {
    const { lens, renderer, draws, nameOf, frame, runTasks } = setup(["a-1600", "b-1600", "c-1600"])
    lens.show(memory("a"))
    lens.open(0)
    await flush()
    runTasks()
    frame(500)
    lens.show(memory("b"))
    await flush()
    runTasks()
    for (let t = 516; t < 640; t += 16) frame(t, { travel: 0.4 })
    const before = draws.at(-1)!.mix
    lens.show(memory("c"))
    await flush()
    runTasks()
    frame(656, { travel: 0.45 })
    expect(renderer.collapse).toHaveBeenCalledTimes(1)
    expect(renderer.collapse.mock.calls[0][2]).toBeCloseTo(before, 6)
    const after = draws.at(-1)!
    expect(nameOf(after.a)).toBe("collapsed")
    expect(nameOf(after.b)).toBe("c-1600")
  })

  it("holds a voice as an inner light in its own color, with nothing to upload", () => {
    const { lens, renderer, draws, frame } = setup()
    lens.show(voice("v"))
    lens.open(0)
    frame(16)
    expect(renderer.texture).not.toHaveBeenCalled()
    const slot = draws.at(-1)!.a
    expect(slot.texture).toBeNull()
    expect(slot.lightWeight).toBe(1)
    // #ff9a3c in linear light: red full, blue low.
    expect(slot.light[0]).toBeCloseTo(1, 3)
    expect(slot.light[2]).toBeLessThan(0.1)
  })

  it("ripples with the voice, and under reduced motion only glows, with a still clock", async () => {
    const { lens, draws, frame, runTasks } = setup(["a-1600"])
    lens.show(memory("a"))
    lens.open(0)
    await flush()
    runTasks()
    frame(1000, { level: 0.8 })
    expect(draws.at(-1)!.warp).toBeCloseTo(0.8, 6)
    expect(draws.at(-1)!.time).toBeCloseTo(1, 6)
    frame(1016, { level: 0.8, reduced: true })
    expect(draws.at(-1)!.warp).toBe(0)
    expect(draws.at(-1)!.time).toBe(0)
  })

  it("melts back into the flat orb when released", async () => {
    const { lens, draws, frame, runTasks } = setup(["a-1600"])
    lens.show(memory("a"))
    lens.open(0)
    await flush()
    runTasks()
    frame(100)
    frame(100 + GLASS_OPEN_MS)
    expect(draws.at(-1)!.glass).toBe(1)
    lens.release(600)
    frame(600 + GLASS_RELEASE_MS / 2)
    expect(draws.at(-1)!.glass).toBeGreaterThan(0)
    expect(draws.at(-1)!.glass).toBeLessThan(0.2)
    frame(600 + GLASS_RELEASE_MS)
    expect(draws.at(-1)!.glass).toBe(0)
  })

  it("clears the canvas when it is reset, so the next glass never flashes the last one", async () => {
    const { lens, renderer, frame, runTasks } = setup(["a-1600"])
    lens.show(memory("a"))
    lens.open(0)
    await flush()
    runTasks()
    frame(16)
    lens.reset()
    expect(renderer.clear).toHaveBeenCalled()
    renderer.draw.mockClear()
    frame(32)
    expect(renderer.draw).not.toHaveBeenCalled()
  })

  it("is adopted by a holder: placed around the sphere on whole pixels, and given back", () => {
    const { lens } = setup()
    const holder = document.createElement("div")
    lens.attach(holder, { offset: 24, size: 603 })
    expect(lens.canvas.parentElement).toBe(holder)
    expect(lens.canvas.getAttribute("aria-hidden")).toBe("true")
    expect(lens.canvas.style.left).toBe("-24px")
    expect(lens.canvas.style.top).toBe("-24px")
    expect(lens.canvas.style.width).toBe("603px")
    expect(lens.canvas.style.height).toBe("603px")
    lens.detach()
    expect(lens.canvas.parentElement).toBeNull()
  })

  it("sizes the canvas through the renderer", () => {
    const { renderer } = setup()
    expect(renderer.resize).toHaveBeenCalledWith(1206, 1116)
  })

  it("asks the cache for the glass sizes as bitmaps: a mid one, then the one the sphere needs", async () => {
    const { lens, cache } = setup()
    lens.show(memory("a"))
    await flush()
    const asked = cache.bitmap.mock.calls.map(([url]) => url)
    expect(asked).toEqual(expect.arrayContaining(["a-384", "a-1600"]))
  })
})
