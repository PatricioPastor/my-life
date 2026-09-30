export type RendererClass = "hardware" | "software" | "unknown"

export interface RendererInfo {
  webgl2: boolean
  /** Unmasked renderer from WEBGL_debug_renderer_info, when the browser exposes it. */
  renderer?: string
  vendor?: string
}

const SOFTWARE = /swiftshader|llvmpipe|software|basic render|microsoft basic/i

export function classifyRenderer(info: RendererInfo): RendererClass {
  if (!info.webgl2) return "software"
  const text = `${info.renderer ?? ""} ${info.vendor ?? ""}`.trim()
  if (!text) return "unknown"
  return SOFTWARE.test(text) ? "software" : "hardware"
}

export type BrowserKind = "chrome" | "edge" | "opera" | "firefox" | "safari" | "other"

export interface Instructions {
  browser: BrowserKind
  steps: string[]
}

const CHROMIUM_STEPS = ["Configuración → Sistema → Usar aceleración de gráficos cuando esté disponible → Reiniciar"]

/** Short Spanish steps to turn hardware acceleration on. Brave reports itself as Chrome and shares its path. */
export function instructionsFor(userAgent: string): Instructions {
  // Every iOS browser runs WebKit: there is no toggle to suggest.
  if (/\b(CriOS|FxiOS|EdgiOS|OPiOS)\//.test(userAgent)) return { browser: "safari", steps: [] }
  if (/\bEdg(e|A)?\//.test(userAgent)) return { browser: "edge", steps: CHROMIUM_STEPS }
  if (/\bOPR\/|\bOpera\b/.test(userAgent)) return { browser: "opera", steps: CHROMIUM_STEPS }
  if (/\bFirefox\//.test(userAgent)) {
    return {
      browser: "firefox",
      steps: [
        "Ajustes → General → Rendimiento → desmarca «Usar configuración de rendimiento recomendada» → activa «Usar aceleración de hardware cuando esté disponible»",
      ],
    }
  }
  if (/(Chrome|Chromium)\//.test(userAgent)) return { browser: "chrome", steps: CHROMIUM_STEPS }
  if (/\bSafari\//.test(userAgent)) return { browser: "safari", steps: [] }
  return {
    browser: "other",
    steps: ["Busca «aceleración por hardware» en los ajustes de tu navegador, actívala y reinícialo."],
  }
}
