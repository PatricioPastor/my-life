"use client"

import { useEffect, useRef } from "react"
import { createTunnelRenderer, type TunnelPalette, type TunnelRenderer } from "./create-tunnel-renderer"
import type { GateStatus } from "./gate-machine"

interface AsciiTunnelProps {
  gate: GateStatus
  /** Fixes the ring color sequence; left out, each mount (each visit) draws its own. */
  seed?: number
  /** Tints the tunnel; left out, it is the warm portal. Keep it referentially stable (a constant). */
  palette?: TunnelPalette
}

export function AsciiTunnel({ gate, seed, palette }: AsciiTunnelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bloomRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<TunnelRenderer | null>(null)

  // The loop reads the gate through a getter, so a state change never restarts the canvas.
  const live = useRef({ gate })
  useEffect(() => {
    live.current = { gate }
    // A static (reduced motion) frame has no loop to notice the change, so repaint it.
    rendererRef.current?.refresh()
  }, [gate])

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = canvas?.parentElement
    if (!canvas || !stage) return
    const renderer = createTunnelRenderer(canvas, stage, {
      getGate: () => live.current.gate,
      seed,
      bloom: bloomRef.current,
      palette,
    })
    rendererRef.current = renderer
    return () => {
      renderer?.stop()
      rendererRef.current = null
    }
  }, [seed, palette])

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block h-full w-full" />
      {/* A blurred half-resolution copy of the tunnel, screen-blended over it. The renderer drives its opacity. */}
      <canvas
        ref={bloomRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 block h-full w-full"
        style={{ mixBlendMode: "screen", filter: "blur(10px) contrast(1.5) brightness(1.3)", opacity: 0.4 }}
      />
    </>
  )
}
