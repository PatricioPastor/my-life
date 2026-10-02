"use client"

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import type { MemoryView } from "../memory-view"
import type { LensGeometry } from "./glass-layout"
import { glassMotion, type GlassMode } from "./glass-mode"
import type { Lens } from "./lens"

type SphereStyle = CSSProperties & Record<`--${string}`, string | number>

interface GlassSphereProps {
  memory: MemoryView
  /** The photo at the size the sphere shows it (the orb's own square crop), or null for a voice with no photo. */
  photoUrl: string | null
  /** False while the glass melts back into the orb, before the dialog lets go of it. */
  open: boolean
  /** The persistent WebGL lens, or null where there is no WebGL2 (the CSS glass stands in). */
  lens: Lens | null
  geometry: LensGeometry
  reduced: boolean
  /** The voice level, 0..1, read every frame (no React state per frame). */
  level: () => number
}

/**
 * The glass sphere, laid exactly over the disc the approached orb grew into (same center, same size, on whole device
 * pixels). With WebGL it adopts the lens canvas, which condenses the glass out of the flat orb and melts it back on
 * the way out; otherwise a CSS glass circle stands in. A soft halo is drawn in CSS around it, so no canvas edge can
 * ever clip it. The voice lights the halo and moves the glass every frame.
 */
export function GlassSphere({ memory, photoUrl, open, lens, geometry, reduced, level }: GlassSphereProps) {
  const [failed, setFailed] = useState(false)
  const mode: GlassMode = lens !== null && !failed && lens.available() ? "webgl" : "css"
  const own = useRef<HTMLDivElement>(null)
  const slot = useRef<HTMLDivElement>(null)
  const { diameter, center, canvas, dpr } = geometry

  // The sphere adopts the lens canvas for as long as it is on screen, placed on whole device pixels.
  useLayoutEffect(() => {
    const holder = slot.current
    if (mode !== "webgl" || !lens || !holder) return
    lens.resize({ device: canvas.device, deviceDiameter: Math.round(diameter * dpr), diameter, dpr })
    lens.attach(holder, { offset: (canvas.css - diameter) / 2, size: canvas.css })
    const stop = lens.onFail(() => setFailed(true))
    return () => {
      stop()
      lens.detach()
      lens.reset()
    }
  }, [lens, mode, canvas.css, canvas.device, diameter, dpr])

  useLayoutEffect(() => {
    if (mode === "webgl" && lens) lens.show(memory)
  }, [lens, mode, memory])

  useLayoutEffect(() => {
    if (mode !== "webgl" || !lens) return
    const now = performance.now()
    if (open) lens.open(now)
    else lens.release(now)
  }, [lens, mode, open])

  // One loop while the sphere is on screen: the lens draws, and the halo (and the CSS glass) follow the voice.
  useEffect(() => {
    const el = own.current
    if (!el) return
    let raf = 0
    let glow = -1
    let warp = -1
    let glass = -1
    const tick = (now: number) => {
      raf = 0
      const voice = level()
      const motion = glassMotion(voice, reduced)
      const out =
        mode === "webgl" && lens ? lens.frame(now, { level: voice, reduced, travel: null }) : { glow: motion.glow, glass: open ? 1 : 0 }
      if (Math.abs(out.glow - glow) > 0.003) el.style.setProperty("--glow", (glow = out.glow).toFixed(3))
      if (Math.abs(motion.warp - warp) > 0.003) el.style.setProperty("--warp", (warp = motion.warp).toFixed(3))
      if (Math.abs(out.glass - glass) > 0.003) el.style.setProperty("--glass", (glass = out.glass).toFixed(3))
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
    }
  }, [lens, mode, reduced, level, open])

  const style: SphereStyle = {
    "--pc": memory.orbColor,
    "--d": `${diameter}px`,
    left: center.x - diameter / 2,
    top: center.y - diameter / 2,
    width: diameter,
    height: diameter,
  }
  return (
    <div
      ref={own}
      data-glass-sphere
      data-glass={mode}
      data-reduced={reduced}
      data-voice={memory.audio !== null}
      data-open={open}
      className="mem-glass-sphere pointer-events-auto absolute touch-none"
      style={style}
    >
      <span data-glass-halo aria-hidden="true" className="mem-glass-halo" />
      {mode === "webgl" ? <div ref={slot} className="absolute inset-0" /> : <GlassCss memory={memory} photoUrl={photoUrl} />}
      {photoUrl === null && <span role="img" aria-label={`Recuerdo de voz: ${memory.caption}`} className="absolute inset-0 rounded-full" />}
      {photoUrl !== null && mode === "webgl" && (
        // The accessible image of the sphere (the lens draws it). The same signed square crop, with CORS.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={memory.caption} crossOrigin="anonymous" decoding="async" draggable={false} className="sr-only" />
      )}
    </div>
  )
}

/** The fallback glass: a circular photo (or a voice light), a highlight and a rim. The voice drives `--glow` and `--warp`. */
function GlassCss({ memory, photoUrl }: { memory: MemoryView; photoUrl: string | null }) {
  return (
    <div className="mem-glass-css" data-photo={photoUrl !== null}>
      {photoUrl !== null && (
        // The same signed square crop the orb showed, with CORS (the same cached response).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={memory.caption} crossOrigin="anonymous" decoding="async" draggable={false} className="mem-glass-photo" />
      )}
      {photoUrl === null && <span className="mem-glass-voice" aria-hidden="true" />}
      <span className="mem-glass-shine" aria-hidden="true" />
    </div>
  )
}
