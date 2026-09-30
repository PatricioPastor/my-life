import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("probeRenderer", () => {
  it("reports no WebGL2 and never compiles the sky program", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    const { probeRenderer } = await import("./gpu-probe")
    expect(probeRenderer()).toEqual({ webgl2: false })
  })

  it("reads the unmasked renderer, releases the context and caches", async () => {
    const lose = vi.fn()
    const createShader = vi.fn()
    const gl = {
      getExtension: (n: string) =>
        n === "WEBGL_lose_context"
          ? { loseContext: lose }
          : { UNMASKED_RENDERER_WEBGL: 1, UNMASKED_VENDOR_WEBGL: 2 },
      getParameter: (p: number) => (p === 1 ? "Apple M2" : "Apple"),
      createShader,
    }
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as never)
    const { probeRenderer } = await import("./gpu-probe")
    expect(probeRenderer()).toEqual({ webgl2: true, renderer: "Apple M2", vendor: "Apple" })
    probeRenderer()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(lose).toHaveBeenCalledTimes(1)
    expect(createShader).not.toHaveBeenCalled()
  })
})
