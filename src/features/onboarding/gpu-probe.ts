import type { RendererInfo } from "./gpu"

let cached: RendererInfo | null = null

/** Reads the unmasked renderer on a throwaway WebGL2 context. Never compiles a program, never throws; cached. */
export function probeRenderer(): RendererInfo {
  if (cached) return cached
  cached = read()
  return cached
}

function read(): RendererInfo {
  let gl: WebGL2RenderingContext | null = null
  try {
    const canvas = document.createElement("canvas")
    canvas.width = 1
    canvas.height = 1
    gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false })
    if (!gl) return { webgl2: false }
    const info = gl.getExtension("WEBGL_debug_renderer_info")
    if (!info) return { webgl2: true }
    return {
      webgl2: true,
      renderer: String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)),
      vendor: String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL)),
    }
  } catch {
    return { webgl2: !!gl }
  } finally {
    try {
      gl?.getExtension("WEBGL_lose_context")?.loseContext()
    } catch {
      // Releasing is best effort.
    }
  }
}
