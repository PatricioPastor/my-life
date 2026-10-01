"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { formatMemoryDate, truncateCaption } from "../format"
import type { MemoryView } from "../memory-view"
import { rimColor } from "../orb-color"
import { startConstellation, type ConstellationLoop } from "./constellation-loop"
import { createSim } from "./constellation-sim"
import { memoriesKeepOut } from "./keep-out"
import { orbDepth, orbMetrics } from "./orb-depth"
import { driftFor, layoutPoints } from "./point-layout"
import { buildEdges } from "./similarity"
import { useViewport } from "./use-viewport"

const LABEL_MAX = 28
const STAGGER_MS = 55
const STAGGER_CAP = 24
const NARROW_PX = 640

interface MemoryPointsProps {
  memories: readonly MemoryView[]
  reduced: boolean
  onOpen: (id: string, origin: { x: number; y: number }) => void
}

type PointStyle = CSSProperties & Record<`--${string}`, string>

/**
 * One soft round orb per memory, tinted with the memory's own color (core, halo and rim), each at its own seeded
 * depth (size, focus and brightness). Related memories (same day or week, same place) are linked, and a small
 * force simulation lets the orbs wander, keep their distance and gather into clusters along those links, with a
 * hairline edge between them on a canvas behind. The orbs stay real buttons named by caption and date, in list
 * (date) order; they move by `style.transform` from one rAF loop, never by React state. An orb under the pointer
 * or focus is held still and lights its links; reduced motion gets one settled, still layout.
 */
export function MemoryPoints({ memories, reduced, onOpen }: MemoryPointsProps) {
  const { width, height } = useViewport()
  const [ready, setReady] = useState<ReadonlySet<string>>(() => new Set())
  const markReady = (id: string) => setReady((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))

  const listRef = useRef<HTMLUListElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const loopRef = useRef<ConstellationLoop | null>(null)
  // Where each orb was when the simulation last stopped, so a new memory never makes the others jump back.
  const carry = useRef<{ view: string; at: Map<string, { x: number; y: number }> } | null>(null)

  const points = useMemo(() => {
    const narrow = width < NARROW_PX
    return layoutPoints(
      memories.map((m) => m.id),
      {
        width,
        height,
        margin: narrow ? 36 : 56,
        spacing: narrow ? 44 : 60,
        keepOut: memoriesKeepOut(width, height),
      },
    )
  }, [memories, width, height])
  const edges = useMemo(() => buildEdges(memories), [memories])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const narrow = width < NARROW_PX
    const view = `${width}x${height}`
    const kept = carry.current?.view === view ? carry.current.at : null
    const items = Array.from(list.children) as HTMLElement[]
    const ids = memories.map((m) => m.id)
    const sim = createSim({
      ids,
      x: points.map((p, i) => kept?.get(ids[i])?.x ?? p.x),
      y: points.map((p, i) => kept?.get(ids[i])?.y ?? p.y),
      edges,
      area: { width, height, margin: narrow ? 36 : 56, keepOut: memoriesKeepOut(width, height) },
    })
    const loop = startConstellation({
      sim,
      edges,
      colors: memories.map((m) => m.orbColor),
      items,
      canvas: canvasRef.current,
      width,
      height,
      reduced,
    })
    loopRef.current = loop

    const index = new Map(ids.map((id, i) => [id, i]))
    const orbAt = (target: EventTarget | null) => {
      const id = (target as Element | null)?.closest?.("[data-memory-id]")?.getAttribute("data-memory-id")
      return id === null || id === undefined ? null : (index.get(id) ?? null)
    }
    // A finger holds the orb it is on too: it stops under the finger, so the tap lands where the visitor aimed
    // (it lets go on pointerout, which a touch fires when it lifts).
    const onOver = (event: PointerEvent) => loop.hold("hover", orbAt(event.target))
    const onOut = (event: PointerEvent) => {
      if (orbAt(event.relatedTarget) === null) loop.hold("hover", null)
    }
    const onFocusIn = (event: FocusEvent) => loop.hold("focus", orbAt(event.target))
    const onFocusOut = () => loop.hold("focus", null)
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return
      const rect = list.getBoundingClientRect()
      loop.pointer({ x: event.clientX - rect.left, y: event.clientY - rect.top })
    }
    const onLeave = () => loop.pointer(null)
    list.addEventListener("pointerover", onOver)
    list.addEventListener("pointerout", onOut)
    list.addEventListener("focusin", onFocusIn)
    list.addEventListener("focusout", onFocusOut)
    window.addEventListener("pointermove", onMove, { passive: true })
    document.documentElement.addEventListener("mouseleave", onLeave)

    return () => {
      list.removeEventListener("pointerover", onOver)
      list.removeEventListener("pointerout", onOut)
      list.removeEventListener("focusin", onFocusIn)
      list.removeEventListener("focusout", onFocusOut)
      window.removeEventListener("pointermove", onMove)
      document.documentElement.removeEventListener("mouseleave", onLeave)
      loop.dispose()
      loopRef.current = null
      carry.current = { view, at: new Map(ids.map((id, i) => [id, { x: sim.x[i], y: sim.y[i] }])) }
    }
  }, [memories, points, edges, width, height, reduced])

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        data-edges
        className="pointer-events-none absolute top-0 left-0"
        style={{ width, height }}
      />
      <ul ref={listRef} aria-label="Recuerdos" className="pointer-events-none absolute inset-0 m-0 list-none p-0">
        {memories.map((memory, index) => {
          const { x, y } = points[index]
          const orb = orbMetrics(orbDepth(memory.id))
          const drift = driftFor(memory.id)
          const date = formatMemoryDate(memory.happenedOn)
          const pending = memory.status === "pending"
          const style: PointStyle = {
            "--pc": memory.orbColor,
            // The neighbouring hue of the orb's own color, for its chromatic rim.
            "--rim": rimColor(memory.orbColor),
            "--size": `${orb.size.toFixed(1)}px`,
            "--alpha": orb.alpha.toFixed(2),
            "--soft": orb.softness.toFixed(2),
            // The simulation does the wandering; this is only a small breath on top of it.
            "--dx": `${(drift.dx * orb.driftScale * 0.5).toFixed(1)}px`,
            "--dy": `${(drift.dy * orb.driftScale * 0.5).toFixed(1)}px`,
            "--dur": `${drift.duration.toFixed(1)}s`,
            "--delay": `${drift.delay.toFixed(1)}s`,
            "--stagger": `${Math.min(index, STAGGER_CAP) * STAGGER_MS}ms`,
          }
          return (
            <li
              key={memory.id}
              className="absolute top-0 left-0 size-0"
              // The seeded spot until the simulation takes over; it rewrites the transform every frame.
              style={{ transform: `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)` }}
            >
              <button
                type="button"
                className="mem-point pointer-events-auto absolute -mt-[22px] -ml-[22px] size-11"
                style={style}
                aria-label={`${memory.caption}, ${date}${pending ? ", pendiente" : ""}`}
                data-magnetic="light"
                data-cursor-id={memory.id}
                data-cursor-label={truncateCaption(memory.caption, LABEL_MAX)}
                data-cursor-context={date}
                data-memory-id={memory.id}
                data-ready={ready.has(memory.id)}
                data-pending={pending}
                data-reduced={reduced}
                data-link="idle"
                // The viewer opens from where the orb is now, not from where it started.
                onClick={() => onOpen(memory.id, loopRef.current?.positionOf(index) ?? { x, y })}
              >
                <span className="mem-drift" aria-hidden="true">
                  <span className="mem-dot" />
                  <span className="mem-thumb">
                    {/* A Cloudinary URL that is already sized and optimized (f_auto, q_auto, 160 px); next/image would only re-proxy it. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={memory.thumbUrl}
                      alt=""
                      // A cached or server-rendered image can finish before React attaches onLoad.
                      ref={(img) => {
                        if (img?.complete) markReady(memory.id)
                      }}
                      decoding="async"
                      draggable={false}
                      onLoad={() => markReady(memory.id)}
                      onError={() => markReady(memory.id)}
                    />
                  </span>
                  {pending && <span className="mem-pending">Pendiente</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
