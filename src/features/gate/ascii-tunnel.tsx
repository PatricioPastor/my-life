"use client"

import { useEffect, useRef } from "react"
import { createTunnelRenderer } from "./create-tunnel-renderer"
import type { GateStatus } from "./gate-machine"

interface AsciiTunnelProps {
  gate: GateStatus
  /** Fixes the ring color sequence; left out, each mount (each visit) draws its own. */
  seed?: number
}

export function AsciiTunnel({ gate, seed }: AsciiTunnelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // The loop reads the gate through a getter, so a state change never restarts the canvas.
  const live = useRef({ gate })
  useEffect(() => {
    live.current = { gate }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = canvas?.parentElement
    if (!canvas || !stage) return
    const renderer = createTunnelRenderer(canvas, stage, {
      getGate: () => live.current.gate,
      seed,
    })
    return () => renderer?.stop()
  }, [seed])

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block h-full w-full" />
}
