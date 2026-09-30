import { describe, expect, it } from "vitest"
import { classifyRenderer, instructionsFor } from "./gpu"

describe("classifyRenderer", () => {
  it("treats a missing WebGL2 as software", () => {
    expect(classifyRenderer({ webgl2: false })).toBe("software")
    expect(classifyRenderer({ webgl2: false, renderer: "NVIDIA GeForce RTX 4070" })).toBe("software")
  })

  it("recognises software rasterisers by renderer or vendor", () => {
    const renderers = [
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)",
      "llvmpipe (LLVM 15.0.7, 256 bits)",
      "Microsoft Basic Render Driver",
      "Mesa Software Rasterizer",
      "Software Renderer",
    ]
    for (const renderer of renderers) expect(classifyRenderer({ webgl2: true, renderer })).toBe("software")
    expect(classifyRenderer({ webgl2: true, renderer: "ANGLE", vendor: "Google Inc. (Microsoft Basic Render)" })).toBe("software")
  })

  it("accepts real GPUs as hardware", () => {
    expect(classifyRenderer({ webgl2: true, renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)", vendor: "Google Inc. (NVIDIA)" })).toBe("hardware")
    expect(classifyRenderer({ webgl2: true, renderer: "Apple M2", vendor: "Apple" })).toBe("hardware")
  })

  it("is unknown when WebGL2 works but the renderer is hidden", () => {
    expect(classifyRenderer({ webgl2: true })).toBe("unknown")
    expect(classifyRenderer({ webgl2: true, renderer: "  " })).toBe("unknown")
  })
})

describe("instructionsFor", () => {
  const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  const EDGE = `${CHROME} Edg/126.0.0.0`
  const OPERA = `${CHROME} OPR/110.0.0.0`
  const FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0"
  const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"

  it("gives the Chromium path for Chrome, Edge and Opera", () => {
    for (const ua of [CHROME, EDGE, OPERA]) {
      expect(instructionsFor(ua).steps).toEqual([
        "Configuración → Sistema → Usar aceleración de gráficos cuando esté disponible → Reiniciar",
      ])
    }
    expect(instructionsFor(EDGE).browser).toBe("edge")
    expect(instructionsFor(OPERA).browser).toBe("opera")
    expect(instructionsFor(CHROME).browser).toBe("chrome")
  })

  it("recognises headless and Chromium builds as Chrome", () => {
    expect(instructionsFor(CHROME.replace("Chrome/", "HeadlessChrome/")).browser).toBe("chrome")
    expect(instructionsFor(CHROME.replace("Chrome/", "Chromium/")).browser).toBe("chrome")
  })

  it("needs no toggle on iOS browsers, which all run WebKit", () => {
    const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1"
    expect(instructionsFor(IOS)).toEqual({ browser: "safari", steps: [] })
  })

  it("gives Firefox its own path", () => {
    const r = instructionsFor(FIREFOX)
    expect(r.browser).toBe("firefox")
    expect(r.steps.join(" ")).toContain("Usar configuración de rendimiento recomendada")
    expect(r.steps.join(" ")).toContain("Usar aceleración de hardware cuando esté disponible")
  })

  it("needs no toggle on Safari", () => {
    expect(instructionsFor(SAFARI)).toEqual({ browser: "safari", steps: [] })
  })

  it("falls back to a generic hint", () => {
    const r = instructionsFor("SomeOtherBrowser/1.0")
    expect(r.browser).toBe("other")
    expect(r.steps).toHaveLength(1)
    expect(r.steps[0]).toContain("aceleración")
  })
})
