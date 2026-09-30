"use client"

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react"
import { createSkyRenderer, type SkyRenderer } from "./create-sky-renderer"
import { resolveSkyParams, skyFallbackGradient, type SkyPresetName } from "./sky-params"
import type { SparkleAnchor } from "./sparkles"

export interface HalftoneSkyHandle {
  /** Move the lamp and send a shock ring through the gas (0..1, y up). */
  pulse: (x: number, y: number) => void
  /** Move the lamp only (0..1, y up). */
  aim: (x: number, y: number) => void
  /** Focus an anchor by index (dims the gas, reveals the star), or null to release. */
  focus: (index: number | null) => void
}

export interface HalftoneSkyProps {
  ref?: Ref<HalftoneSkyHandle>
  preset?: SkyPresetName
  pixel?: number
  /** Facet star positions the bright sparkles hang on. */
  anchors?: readonly SparkleAnchor[]
  /** Pause painting (the loop idles) while another screen covers the sky. */
  hidden?: boolean
  /** Whether a click on open sky hangs a sparkle. */
  allowSparkles?: boolean
  /** Parallax offset in CSS px, for a label layer that should ride with the sparkles. */
  onLayerShift?: (x: number, y: number) => void
  className?: string
  /** Overlays (labels, stars) rendered inside the stage so their pointer events reach the sky. */
  children?: ReactNode
}

const NO_ANCHORS: readonly SparkleAnchor[] = []

export function HalftoneSky({
  ref,
  preset = "ember",
  pixel,
  anchors = NO_ANCHORS,
  hidden = false,
  allowSparkles = true,
  onLayerShift,
  className,
  children,
}: HalftoneSkyProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<SkyRenderer | null>(null)
  const [failed, setFailed] = useState(false)

  const params = useMemo(() => resolveSkyParams(preset, pixel === undefined ? {} : { pixel }), [preset, pixel])

  // The render loop reads the latest props through this ref, so a prop change never restarts WebGL.
  const live = useRef({ params, anchors, hidden, allowSparkles, onLayerShift })
  useEffect(() => {
    live.current = { params, anchors, hidden, allowSparkles, onLayerShift }
  })

  useImperativeHandle(
    ref,
    () => ({
      pulse: (x, y) => rendererRef.current?.pulse(x, y),
      aim: (x, y) => rendererRef.current?.aim(x, y),
      focus: (index) => rendererRef.current?.focus(index),
    }),
    [],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return
    const renderer = createSkyRenderer(canvas, stage, {
      getParams: () => live.current.params,
      getAnchors: () => live.current.anchors,
      isHidden: () => live.current.hidden,
      canDropSparkle: () => live.current.allowSparkles,
      onLayerShift: (x, y) => live.current.onLayerShift?.(x, y),
    })
    rendererRef.current = renderer
    if (!renderer) setFailed(true)
    return () => {
      renderer?.stop()
      rendererRef.current = null
    }
  }, [])

  return (
    <div
      ref={stageRef}
      className={className ?? "relative h-full w-full overflow-hidden"}
      style={{ background: params.voidColor, cursor: allowSparkles && !hidden ? "crosshair" : "default" }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 block h-full w-full"
        style={{ imageRendering: "pixelated" }}
      />
      {failed && (
        <div
          data-testid="sky-fallback"
          className="absolute inset-0"
          style={{ background: skyFallbackGradient(params) }}
        />
      )}
      {children}
    </div>
  )
}
