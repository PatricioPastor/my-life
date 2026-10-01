import { describe, expect, it, vi } from "vitest"
import { createGlassRenderer } from "./glass-renderer"

/** A WebGL2 stand-in: every method is a spy, constants are numbers, and compile/link always succeed. */
function fakeContext() {
  const loseContext = vi.fn()
  const methods = new Map<PropertyKey, unknown>([
    ["getShaderParameter", () => true],
    ["getProgramParameter", () => true],
    ["isContextLost", () => false],
    ["getExtension", (name: string) => (name === "WEBGL_lose_context" ? { loseContext } : null)],
  ])
  const gl = new Proxy({} as Record<PropertyKey, unknown>, {
    get(target, key) {
      if (methods.has(key)) return methods.get(key)
      if (typeof key === "string" && /^[A-Z_0-9]+$/.test(key)) return 1
      if (!(key in target)) target[key] = vi.fn(() => ({}))
      return target[key]
    },
  })
  return { gl, loseContext }
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

describe("createGlassRenderer", () => {
  it("leaves the context usable after dispose, so the same canvas can draw again", () => {
    const { gl, loseContext } = fakeContext()
    const canvas = fakeCanvas(gl)
    const first = createGlassRenderer(canvas, { tint: [0.5, 0.6, 0.9], onLost: vi.fn() })
    expect(first).not.toBeNull()
    first!.dispose()
    // Losing the context here would hand a dead context to the next effect run (a resize, StrictMode).
    expect(loseContext).not.toHaveBeenCalled()
    const second = createGlassRenderer(canvas, { tint: [0.5, 0.6, 0.9], onLost: vi.fn() })
    expect(second).not.toBeNull()
  })
})
