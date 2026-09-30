"use client"

import { useEffect, useRef } from "react"
import { GRAIN_FPS, GRAIN_H, GRAIN_W, fillGrain } from "./grain"

/** A small noise canvas redrawn at film rate and scaled up by CSS. Paused while hidden; static under reduced motion. */
export function FilmGrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const image = ctx.createImageData(GRAIN_W, GRAIN_H)
    const pixels = new Uint32Array(image.data.buffer)
    const draw = () => {
      fillGrain(pixels)
      ctx.putImageData(image, 0, 0)
    }
    draw()
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (reduced) return

    let timer: ReturnType<typeof setTimeout> | undefined
    const loop = () => {
      draw()
      timer = setTimeout(loop, 1000 / GRAIN_FPS)
    }
    const sync = () => {
      clearTimeout(timer)
      timer = undefined
      if (!document.hidden) timer = setTimeout(loop, 1000 / GRAIN_FPS)
    }
    sync()
    document.addEventListener("visibilitychange", sync)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", sync)
    }
  }, [])

  return <canvas ref={canvasRef} width={GRAIN_W} height={GRAIN_H} aria-hidden="true" className="ob-grain" />
}
