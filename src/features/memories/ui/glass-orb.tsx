"use client"

import { useEffect, useRef, type CSSProperties } from "react"
import type { MemoryView } from "../memory-view"
import { CANVAS_SCALE, glassMotion, hexToUnit, type GlassMode } from "./glass-mode"
import { createGlassRenderer } from "./glass-renderer"

const MAX_DPR = 2

interface GlassOrbProps {
  memory: MemoryView
  /** The photo at the size the sphere shows it (a square crop), or null for a voice with no photo. */
  photoUrl: string | null
  mode: GlassMode
  reduced: boolean
  /** The voice level, 0..1, read every frame (no React state per frame). */
  level: () => number
  /** The sphere's diameter in CSS px. */
  diameter: number
  /** WebGL could not draw (no context, a lost context, a photo it may not read): the view switches to the CSS glass. */
  onFail: () => void
}

/** The photo, as the accessible image of the sphere. In WebGL mode it is the texture source and stays out of sight. */
function Photo({
  memory,
  url,
  hidden,
  imgRef,
}: {
  memory: MemoryView
  url: string | null
  hidden: boolean
  imgRef?: React.Ref<HTMLImageElement>
}) {
  if (url === null) return null
  return (
    // A signed square crop at the sphere's size (f_auto, q_auto). `crossOrigin` lets WebGL read it, and makes it the
    // same cached response the orb and the approach used: the signed Cloudinary response allows CORS.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={url}
      alt={memory.caption}
      crossOrigin="anonymous"
      decoding="async"
      draggable={false}
      className={hidden ? "sr-only" : "mem-glass-photo"}
    />
  )
}

/**
 * The glass sphere that holds a memory. With WebGL2 it is one canvas drawn by a refraction shader; otherwise a CSS
 * glass circle. An empty glass (a memory with no photo) is an inner light in the orb color that becomes the voice.
 */
export function GlassOrb({ memory, photoUrl, mode, reduced, level, diameter, onFail }: GlassOrbProps) {
  const photo = photoUrl !== null
  return (
    <>
      {mode === "webgl" ? (
        <GlassCanvas memory={memory} photoUrl={photoUrl} reduced={reduced} level={level} diameter={diameter} onFail={onFail} />
      ) : (
        <GlassCss memory={memory} photoUrl={photoUrl} reduced={reduced} level={level} />
      )}
      {!photo && (
        <span
          role="img"
          aria-label={`Recuerdo de voz: ${memory.caption}`}
          className="absolute inset-0 rounded-full"
        />
      )}
    </>
  )
}

function GlassCanvas({ memory, photoUrl, reduced, level, diameter, onFail }: Omit<GlassOrbProps, "mode">) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    canvas.width = canvas.height = Math.max(Math.round(diameter * CANVAS_SCALE * dpr), 2)
    const renderer = createGlassRenderer(canvas, { tint: hexToUnit(memory.orbColor), onLost: onFail })
    if (!renderer) {
      onFail()
      return
    }
    let dirty = true
    let drawn = -1
    let raf = 0
    const img = imgRef.current
    const upload = () => {
      renderer.setPhoto(img)
      dirty = true
    }
    if (img) {
      if (img.complete && img.naturalWidth > 0) upload()
      img.addEventListener("load", upload)
    }
    const tick = (now: number) => {
      raf = 0
      const motion = glassMotion(level(), reduced)
      // Reduced motion has no ripple and no clock: it only redraws when the glow or the photo changes.
      if (!reduced || dirty || Math.abs(motion.glow - drawn) > 0.004) {
        renderer.draw({ ...motion, time: reduced ? 0 : now / 1000 })
        drawn = motion.glow
        dirty = false
      }
      if (!document.hidden) raf = requestAnimationFrame(tick)
    }
    const onVisibility = () => {
      if (!document.hidden && !raf) raf = requestAnimationFrame(tick)
    }
    document.addEventListener("visibilitychange", onVisibility)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener("visibilitychange", onVisibility)
      img?.removeEventListener("load", upload)
      renderer.dispose()
    }
  }, [memory.id, memory.orbColor, diameter, reduced, level, onFail])

  const size = diameter * CANVAS_SCALE
  const offset = (size - diameter) / 2
  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{ width: size, height: size, left: -offset, top: -offset }}
      />
      <Photo memory={memory} url={photoUrl} hidden imgRef={imgRef} />
    </>
  )
}

type GlassStyle = CSSProperties & Record<`--${string}`, string>

/** The fallback glass: radial gradients, a circular-clipped photo and a highlight. The voice drives `--glow` and `--warp`. */
function GlassCss({ memory, photoUrl, reduced, level }: Pick<GlassOrbProps, "memory" | "photoUrl" | "reduced" | "level">) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    let glow = -1
    let warp = -1
    const tick = () => {
      raf = 0
      const motion = glassMotion(level(), reduced)
      if (Math.abs(motion.glow - glow) > 0.003 || Math.abs(motion.warp - warp) > 0.003) {
        glow = motion.glow
        warp = motion.warp
        el.style.setProperty("--glow", glow.toFixed(3))
        el.style.setProperty("--warp", warp.toFixed(3))
      }
      if (!document.hidden) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [level, reduced])

  const style: GlassStyle = { "--glow": "0", "--warp": "0" }
  return (
    <div ref={ref} className="mem-glass-css" data-photo={photoUrl !== null} style={style}>
      <Photo memory={memory} url={photoUrl} hidden={false} />
      {photoUrl === null && <span className="mem-glass-voice" aria-hidden="true" />}
      <span className="mem-glass-shine" aria-hidden="true" />
    </div>
  )
}
