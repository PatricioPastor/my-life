import { afterEach, describe, expect, it, vi } from "vitest"
import { PORTAL } from "@/shared/lib/palette"
import { createTunnelRenderer } from "./create-tunnel-renderer"

afterEach(() => vi.restoreAllMocks())

/** A 2D context that records every fillStyle it is given and draws nothing. */
function recordingContext() {
  const fills: string[] = []
  let style = ""
  const ctx = new Proxy(
    {},
    {
      get: (_t, prop) => (prop === "fillStyle" ? style : () => ({ addColorStop() {} })),
      set: (_t, prop, value) => {
        if (prop === "fillStyle") {
          style = String(value)
          fills.push(style)
        }
        return true
      },
    },
  )
  return { ctx, fills }
}

function paint(palette?: { rings: readonly string[]; deep: string }) {
  const { ctx, fills } = recordingContext()
  const canvas = document.createElement("canvas")
  vi.spyOn(canvas, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  const stage = document.createElement("div")
  const renderer = createTunnelRenderer(canvas, stage, { getGate: () => "granted", seed: 1, palette })
  renderer?.stop()
  return fills
}

describe("createTunnelRenderer palette", () => {
  it("paints the warm portal by default", () => {
    expect(paint()[0]).toBe(PORTAL.deep)
  })

  it("paints with the palette it is given instead, background and rings", () => {
    const cool = { rings: ["#7fe3f2", "#8fa4ff", "#b38cff", "#e27bea"], deep: "#05060f" }
    const fills = paint(cool)
    expect(fills[0]).toBe("#05060f")
    expect(fills).not.toContain(PORTAL.deep)
    for (const warm of PORTAL.rings) expect(fills).not.toContain(warm)
  })
})
