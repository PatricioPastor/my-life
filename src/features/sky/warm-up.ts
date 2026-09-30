import { SKY_UNIFORM_SLOTS, SKY_VERTEX, buildSkyFragment } from "./shaders"

export interface WebGLProbe {
  webgl2: boolean
  renderer?: string
  vendor?: string
  /** Whether the sky program compiled and linked on this GPU. */
  compiled: boolean
}

let cached: WebGLProbe | null = null

/**
 * Compiles and links the sky program once on a throwaway WebGL2 context so the real mount finds the
 * driver's shader cache warm, and reads the unmasked renderer on the way. Never throws; the answer is cached.
 */
export function warmUpSky(): WebGLProbe {
  if (cached) return cached
  cached = probe()
  return cached
}

function probe(): WebGLProbe {
  let gl: WebGL2RenderingContext | null = null
  try {
    const canvas = document.createElement("canvas")
    canvas.width = 1
    canvas.height = 1
    gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, powerPreference: "high-performance" })
    if (!gl) return { webgl2: false, compiled: false }

    const info = gl.getExtension("WEBGL_debug_renderer_info")
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : undefined
    const vendor = info ? String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL)) : undefined

    const build = (type: number, source: string) => {
      const shader = gl!.createShader(type)
      if (!shader) return null
      gl!.shaderSource(shader, source)
      gl!.compileShader(shader)
      return shader
    }
    const vs = build(gl.VERTEX_SHADER, SKY_VERTEX)
    const fs = build(gl.FRAGMENT_SHADER, buildSkyFragment(SKY_UNIFORM_SLOTS))
    const program = vs && fs ? gl.createProgram() : null
    let compiled = false
    if (program && vs && fs) {
      gl.attachShader(program, vs)
      gl.attachShader(program, fs)
      gl.linkProgram(program)
      compiled = !!gl.getProgramParameter(program, gl.LINK_STATUS)
      gl.deleteProgram(program)
    }
    if (vs) gl.deleteShader(vs)
    if (fs) gl.deleteShader(fs)
    return { webgl2: true, renderer, vendor, compiled }
  } catch {
    return { webgl2: !!gl, compiled: false }
  } finally {
    try {
      gl?.getExtension("WEBGL_lose_context")?.loseContext()
    } catch {
      // Releasing is best effort.
    }
  }
}
