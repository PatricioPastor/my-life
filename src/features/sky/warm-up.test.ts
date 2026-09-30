import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("warmUpSky", () => {
  it("reports no WebGL2 without throwing", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    const { warmUpSky } = await import("./warm-up")
    expect(warmUpSky()).toEqual({ webgl2: false, compiled: false })
  })

  it("survives a context that throws, and answers from cache afterwards", async () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      throw new Error("lost")
    })
    const { warmUpSky } = await import("./warm-up")
    const first = warmUpSky()
    expect(first.compiled).toBe(false)
    warmUpSky()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("compiles once and releases the context", async () => {
    const lose = vi.fn()
    const gl = {
      VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, LINK_STATUS: 3,
      getExtension: (n: string) => (n === "WEBGL_lose_context" ? { loseContext: lose } : null),
      createShader: () => ({}), shaderSource: vi.fn(), compileShader: vi.fn(),
      createProgram: () => ({}), attachShader: vi.fn(), linkProgram: vi.fn(),
      getProgramParameter: () => true, deleteProgram: vi.fn(), deleteShader: vi.fn(),
    }
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as never)
    const { warmUpSky } = await import("./warm-up")
    expect(warmUpSky()).toMatchObject({ webgl2: true, compiled: true })
    expect(lose).toHaveBeenCalledTimes(1)
  })
})
