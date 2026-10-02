import { describe, expect, it, vi } from "vitest"
import { createGlassRenderer, setupPhotoTexture, srgbToLinear, type LensSlot } from "./glass-renderer"

type Call = [string, unknown[]]

/**
 * A WebGL2 stand-in: every constant has its own number (named back in the log), every method is recorded, and
 * compile and link always succeed. `extensions` decides which extensions exist.
 */
function fakeGL(extensions: Record<string, unknown> = {}) {
  const calls: Call[] = []
  const names = new Map<number, string>()
  const constants = new Map<string, number>()
  const constant = (name: string) => {
    if (!constants.has(name)) {
      const value = 0x9000 + constants.size
      constants.set(name, value)
      names.set(value, name)
    }
    return constants.get(name)!
  }
  const special: Record<string, unknown> = {
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    isContextLost: () => false,
    getExtension: (name: string) => extensions[name] ?? null,
    // The anisotropy extension reports a maximum of 16.
    getParameter: (p: number) => {
      calls.push(["getParameter", [p]])
      return p === 0x84ff ? 16 : 0
    },
    checkFramebufferStatus: () => constant("FRAMEBUFFER_COMPLETE"),
  }
  const gl = new Proxy({} as Record<string, unknown>, {
    get(target, key) {
      if (typeof key !== "string") return undefined
      if (key in special) return special[key]
      if (/^[A-Z_0-9]+$/.test(key)) return constant(key)
      if (!(key in target))
        target[key] = (...args: unknown[]) => {
          calls.push([key, args])
          return { id: calls.length }
        }
      return target[key]
    },
  })
  /** The calls to a method, with GL constants given back their names. */
  const of = (method: string) =>
    calls.filter(([m]) => m === method).map(([, args]) => args.map((a) => (typeof a === "number" && names.has(a) ? names.get(a) : a)))
  return { gl, calls, of, extensions }
}

function fakeCanvas(gl: unknown) {
  return {
    width: 64,
    height: 64,
    getContext: vi.fn(() => gl),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLCanvasElement
}

const photo = { width: 1600, height: 1600 } as unknown as ImageBitmap
const voice: LensSlot = { texture: null, light: [0.6, 0.4, 0.2], lightWeight: 1, tint: [0.6, 0.4, 0.2] }

describe("the photo texture", () => {
  it("is stored as sRGB, so the shader works on real light and the photo's colors come back exact", () => {
    const { gl, of } = fakeGL()
    setupPhotoTexture(gl as unknown as WebGL2RenderingContext, photo)
    const [storage] = of("texStorage2D")
    expect(storage[2]).toBe("SRGB8_ALPHA8")
    // A full chain of mip levels: 1600 halves 11 times down to 1.
    expect(storage[1]).toBe(11)
    expect(storage.slice(3)).toEqual([1600, 1600])
    expect(of("texSubImage2D")[0]).toEqual(["TEXTURE_2D", 0, 0, 0, "RGBA", "UNSIGNED_BYTE", photo])
  })

  it("is mipmapped and filtered trilinearly, so a big photo shrinks into the sphere without shimmer", () => {
    const { gl, of } = fakeGL()
    setupPhotoTexture(gl as unknown as WebGL2RenderingContext, photo)
    expect(of("generateMipmap")).toEqual([["TEXTURE_2D"]])
    const params = of("texParameteri")
    expect(params).toContainEqual(["TEXTURE_2D", "TEXTURE_MIN_FILTER", "LINEAR_MIPMAP_LINEAR"])
    expect(params).toContainEqual(["TEXTURE_2D", "TEXTURE_MAG_FILTER", "LINEAR"])
    expect(params).toContainEqual(["TEXTURE_2D", "TEXTURE_WRAP_S", "CLAMP_TO_EDGE"])
    expect(params).toContainEqual(["TEXTURE_2D", "TEXTURE_WRAP_T", "CLAMP_TO_EDGE"])
  })

  it("uses anisotropic filtering where the GPU offers it, up to 8x, for the gathered rim", () => {
    const aniso = { TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff }
    const { gl, of } = fakeGL({ EXT_texture_filter_anisotropic: aniso })
    setupPhotoTexture(gl as unknown as WebGL2RenderingContext, photo, { anisotropy: 8 })
    expect(of("texParameterf")).toContainEqual(["TEXTURE_2D", 0x84fe, 8])
  })

  it("never queries the GPU while uploading: a query waits for every queued draw", () => {
    const aniso = { TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff }
    const { gl, of } = fakeGL({ EXT_texture_filter_anisotropic: aniso })
    setupPhotoTexture(gl as unknown as WebGL2RenderingContext, photo, { anisotropy: 8 })
    expect(of("getParameter")).toEqual([])
  })

  it("asks for the GPU's anisotropy limit once, when it is built, and never above 8x", () => {
    const aniso = { TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff }
    const { gl, of } = fakeGL({ EXT_texture_filter_anisotropic: aniso })
    const renderer = createGlassRenderer(fakeCanvas(gl), {})!
    renderer.texture(photo)
    renderer.texture(photo)
    expect(of("getParameter")).toHaveLength(1)
    expect(of("texParameterf")).toEqual([
      ["TEXTURE_2D", 0x84fe, 8],
      ["TEXTURE_2D", 0x84fe, 8],
    ])
  })

  it("does without anisotropic filtering when there is none", () => {
    const { gl, of } = fakeGL()
    setupPhotoTexture(gl as unknown as WebGL2RenderingContext, photo)
    expect(of("texParameterf")).toEqual([])
  })

  it("never flips or premultiplies the photo on the way in (the shader reads it upright, with straight alpha)", () => {
    const { gl, of } = fakeGL()
    setupPhotoTexture(gl as unknown as WebGL2RenderingContext, photo)
    expect(of("pixelStorei")).toContainEqual(["UNPACK_FLIP_Y_WEBGL", false])
    expect(of("pixelStorei")).toContainEqual(["UNPACK_PREMULTIPLY_ALPHA_WEBGL", false])
  })
})

describe("the glass renderer", () => {
  it("leaves the context usable after dispose, so the same canvas can draw again", () => {
    const loseContext = vi.fn()
    const { gl } = fakeGL({ WEBGL_lose_context: { loseContext } })
    const canvas = fakeCanvas(gl)
    const first = createGlassRenderer(canvas, { onLost: vi.fn() })
    expect(first).not.toBeNull()
    first!.dispose()
    // Losing the context here would hand a dead context to the next effect run (a resize, StrictMode).
    expect(loseContext).not.toHaveBeenCalled()
    expect(createGlassRenderer(canvas, { onLost: vi.fn() })).not.toBeNull()
  })

  it("sizes the canvas to exact device pixels and tells the shader where the sphere's rim is", () => {
    const { gl, of } = fakeGL()
    const canvas = fakeCanvas(gl)
    const renderer = createGlassRenderer(canvas, {})!
    renderer.resize(1206, 1116)
    expect(canvas.width).toBe(1206)
    expect(canvas.height).toBe(1206)
    renderer.draw(voice, null, { time: 0, warp: 0, glow: 0, glass: 1, mix: 0 })
    expect(of("viewport")).toContainEqual([0, 0, 1206, 1206])
    expect(of("uniform1f").some(([, v]) => v === 1116 / 1206)).toBe(true)
  })

  it("clears to transparent", () => {
    const { gl, of } = fakeGL()
    const renderer = createGlassRenderer(fakeCanvas(gl), {})!
    renderer.clear()
    expect(of("clear")).toEqual([["COLOR_BUFFER_BIT"]])
  })

  it("draws two contents and the dissolve between them", () => {
    const { gl, of } = fakeGL()
    const renderer = createGlassRenderer(fakeCanvas(gl), {})!
    const tex = renderer.texture(photo)
    const a: LensSlot = { texture: tex, light: [0, 0, 0], lightWeight: 0, tint: [0.5, 0.6, 0.9] }
    renderer.draw(a, voice, { time: 1, warp: 0, glow: 0, glass: 0.5, mix: 0.25, fog: 0.75 })
    expect(of("uniform1f").map(([, v]) => v)).toEqual(expect.arrayContaining([0.25, 0.5, 0.75]))
    expect(of("drawArrays")).toEqual([["TRIANGLES", 0, 3]])
  })

  it("can blend what is on screen into one texture, so a new dissolve starts from it with no jump", () => {
    const { gl, of } = fakeGL()
    const renderer = createGlassRenderer(fakeCanvas(gl), {})!
    const a: LensSlot = { texture: renderer.texture(photo), light: [0, 0, 0], lightWeight: 0, tint: [1, 1, 1] }
    const blended = renderer.collapse(a, voice, 0.4, 1024)
    expect(blended).not.toBeNull()
    // Rendered into an sRGB texture of its own, then mipmapped like a photo.
    expect(of("texStorage2D").at(-1)?.[2]).toBe("SRGB8_ALPHA8")
    expect(of("framebufferTexture2D")).toHaveLength(1)
    expect(of("generateMipmap").length).toBeGreaterThanOrEqual(2)
    expect(of("uniform1f").some(([, v]) => v === 0.4)).toBe(true)
  })
})

describe("color", () => {
  it("decodes sRGB to linear light exactly at the ends and in the middle", () => {
    expect(srgbToLinear(0)).toBe(0)
    expect(srgbToLinear(1)).toBeCloseTo(1, 9)
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214, 3)
  })
})
