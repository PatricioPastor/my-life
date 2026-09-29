"use client"

import { useEffect, useMemo, useRef } from "react"
import { resolveSkyParams, type SkyPresetName } from "@/features/sky"
import { createTunnelRenderer } from "./create-tunnel-renderer"
import type { GateStatus } from "./gate-machine"

interface AsciiTunnelProps {
  gate: GateStatus
  preset?: SkyPresetName
}

export function AsciiTunnel({ gate, preset = "crimson" }: AsciiTunnelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const params = useMemo(() => resolveSkyParams(preset), [preset])

  // The loop reads these through getters, so props never restart the canvas.
  const live = useRef({ gate, params })
  useEffect(() => {
    live.current = { gate, params }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = canvas?.parentElement
    if (!canvas || !stage) return
    const renderer = createTunnelRenderer(canvas, stage, {
      getGate: () => live.current.gate,
      getParams: () => live.current.params,
    })
    return () => renderer?.stop()
  }, [])

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block h-full w-full" />
}
