"use client"

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type Ref } from "react"
import { formatMemoryDate, truncateCaption } from "../format"
import type { MemoryView } from "../memory-view"
import { rimColor } from "../orb-color"
import { focusCamera, focusAmount, type Bounds, type Point } from "./camera"
import type { CameraController } from "./camera-controller"
import { startConstellation, type ConstellationLoop } from "./constellation-loop"
import { createSim } from "./constellation-sim"
import { glassLayout, OPEN_ZOOM } from "./glass-layout"
import { orbDepth, orbMetrics } from "./orb-depth"
import { driftFor, layoutPoints } from "./point-layout"
import { buildEdges } from "./similarity"
import { useViewport } from "./use-viewport"

const LABEL_MAX = 28
const STAGGER_MS = 55
const STAGGER_CAP = 24
const WORLD_MARGIN = 70
const CONTENT_PAD = 48
/** An orb that takes focus is brought into the view inside these margins (screen px). */
const VIEW_MARGIN = { top: 100, right: 48, bottom: 150, left: 48 }

/** What the parent can ask of the orbs. */
export interface PointsHandle {
  /** Where the orb of a memory is in the world right now, or null. */
  worldOf: (id: string) => Point | null
}

interface MemoryPointsProps {
  memories: readonly MemoryView[]
  /** The world rectangle the orbs live in, in world px (it grows with the number of memories). */
  bounds: Bounds
  controller: CameraController
  reduced: boolean
  /** The memory the camera is approaching or the glass is open on: it is held still and grows as the camera arrives. */
  approachId: string | null
  onOpen: (id: string, world: Point) => void
  ref?: Ref<PointsHandle>
}

type PointStyle = CSSProperties & Record<`--${string}`, string>

/**
 * One soft round orb per memory, tinted with the memory's own color (core, halo and rim), each at its own seeded
 * depth (size, focus and brightness). Related memories (same day or week, same place) are linked, and a small
 * force simulation, now in world space, lets the orbs wander, keep their distance and gather into clusters along those
 * links, with a hairline edge between them on a canvas behind. The camera moves over it: the orbs and the edges are
 * placed through the camera transform by one rAF loop writing `style.transform`, never React state. The orbs stay
 * real buttons named by caption and date, in list order. An orb under the pointer or focus is held still and lights
 * its links; reduced motion gets one settled, still layout.
 */
export function MemoryPoints({ memories, bounds, controller, reduced, approachId, onOpen, ref }: MemoryPointsProps) {
  const { width, height } = useViewport()
  const [ready, setReady] = useState<ReadonlySet<string>>(() => new Set())
  const markReady = (id: string) => setReady((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))

  const listRef = useRef<HTMLUListElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const loopRef = useRef<ConstellationLoop | null>(null)
  const size = useRef({ width, height })
  const fitted = useRef(false)
  const indexById = useRef<Map<string, number>>(new Map())
  const approachIndex = useRef<number | null>(null)
  const approachRef = useRef(approachId)
  // Where each orb was when the simulation last stopped, so a new memory never makes the others jump back.
  const carry = useRef<Map<string, { x: number; y: number }> | null>(null)

  const points = useMemo(
    () =>
      layoutPoints(
        memories.map((m) => m.id),
        { width: bounds.right, height: bounds.bottom, margin: WORLD_MARGIN, spacing: 70, keepOut: [] },
      ),
    [memories, bounds],
  )
  const edges = useMemo(() => buildEdges(memories), [memories])

  useImperativeHandle(
    ref,
    () => ({
      worldOf: (id) => {
        const index = indexById.current.get(id)
        return index === undefined ? null : (loopRef.current?.positionOf(index) ?? null)
      },
    }),
    [],
  )

  // The viewport changed: the camera and the loop learn the new size (the world does not move).
  useEffect(() => {
    size.current = { width, height }
    controller.setViewport({ width, height })
    loopRef.current?.resize(width, height)
  }, [controller, width, height])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const items = Array.from(list.children) as HTMLElement[]
    const ids = memories.map((m) => m.id)
    const kept = carry.current
    const input = {
      ids,
      x: points.map((p, i) => kept?.get(ids[i])?.x ?? p.x),
      y: points.map((p, i) => kept?.get(ids[i])?.y ?? p.y),
      edges,
      area: { width: bounds.right, height: bounds.bottom, margin: WORLD_MARGIN, keepOut: [] },
    }
    const sim = createSim(input)

    // Fit the camera to where the constellation settles (the links pull the clusters in), not to where its seeded
    // layout starts: a throwaway copy of the simulation is run to rest and measured.
    const resting = createSim(input)
    resting.settle()
    let content: Bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
    for (let i = 0; i < resting.count; i++) {
      content = {
        left: Math.min(content.left, resting.x[i]),
        top: Math.min(content.top, resting.y[i]),
        right: Math.max(content.right, resting.x[i]),
        bottom: Math.max(content.bottom, resting.y[i]),
      }
    }
    if (sim.count === 0) content = bounds
    content = {
      left: content.left - CONTENT_PAD,
      top: content.top - CONTENT_PAD,
      right: content.right + CONTENT_PAD,
      bottom: content.bottom + CONTENT_PAD,
    }
    controller.setViewport(size.current)
    controller.setWorld(bounds, content, !fitted.current)
    fitted.current = true

    const loop = startConstellation({
      sim,
      edges,
      colors: memories.map((m) => m.orbColor),
      items,
      canvas: canvasRef.current,
      width: size.current.width,
      height: size.current.height,
      camera: controller.camera,
      onFrame: (dt) => controller.step(dt),
      reduced,
    })
    loopRef.current = loop

    const index = new Map(ids.map((id, i) => [id, i]))
    indexById.current = index
    const orbAt = (target: EventTarget | null) => {
      const id = (target as Element | null)?.closest?.("[data-memory-id]")?.getAttribute("data-memory-id")
      return id === null || id === undefined ? null : (index.get(id) ?? null)
    }

    // The orb being approached stays put and grows toward the glass as the camera comes in.
    const applyApproach = () => {
      const at = approachIndex.current
      loop.emphasize(
        at,
        at === null ? 0 : focusAmount(controller.camera().zoom, OPEN_ZOOM),
        glassLayout(size.current).diameter,
      )
    }
    approachIndex.current = approachRef.current === null ? null : (index.get(approachRef.current) ?? null)
    loop.hold("approach", approachIndex.current)
    applyApproach()
    const unsubscribe = controller.subscribe(() => {
      applyApproach()
      if (reduced) loop.redraw()
    })

    // A finger holds the orb it is on too: it stops under the finger, so the tap lands where the visitor aimed
    // (it lets go on pointerout, which a touch fires when it lifts).
    const onOver = (event: PointerEvent) => loop.hold("hover", orbAt(event.target))
    const onOut = (event: PointerEvent) => {
      if (orbAt(event.relatedTarget) === null) loop.hold("hover", null)
    }
    // Tabbing to an orb that is off screen brings it into view.
    const onFocusIn = (event: FocusEvent) => {
      const at = orbAt(event.target)
      loop.hold("focus", at)
      if (at === null || !controller.enabled()) return
      const screen = loop.screenOf(at)
      const { width: w, height: h } = size.current
      const inside =
        screen.x >= VIEW_MARGIN.left && screen.x <= w - VIEW_MARGIN.right && screen.y >= VIEW_MARGIN.top && screen.y <= h - VIEW_MARGIN.bottom
      if (!inside) {
        const cam = controller.camera()
        controller.flyTo(focusCamera(loop.positionOf(at), size.current, cam.zoom, { x: 0.5, y: 0.45 }), { curve: "quick" })
      }
    }
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
      unsubscribe()
      list.removeEventListener("pointerover", onOver)
      list.removeEventListener("pointerout", onOut)
      list.removeEventListener("focusin", onFocusIn)
      list.removeEventListener("focusout", onFocusOut)
      window.removeEventListener("pointermove", onMove)
      document.documentElement.removeEventListener("mouseleave", onLeave)
      loop.dispose()
      loopRef.current = null
      carry.current = new Map(ids.map((id, i) => [id, { x: sim.x[i], y: sim.y[i] }]))
    }
    // The approach is applied by its own effect below; it must not rebuild the simulation.
  }, [memories, points, edges, bounds, controller, reduced])

  // The approach (the camera flying to an orb, the glass open on it, the way back) holds that orb and grows it.
  useEffect(() => {
    approachRef.current = approachId
    const loop = loopRef.current
    if (!loop) return
    const at = approachId === null ? null : (indexById.current.get(approachId) ?? null)
    approachIndex.current = at
    loop.hold("approach", at)
    loop.emphasize(at, at === null ? 0 : focusAmount(controller.camera().zoom, OPEN_ZOOM), glassLayout(size.current).diameter)
  }, [approachId, controller])

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
              // Off screen until the loop places it (it rewrites the transform every frame).
              style={{ transform: "translate3d(-200px, -200px, 0)" }}
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
                data-ready={memory.thumbUrl === null || ready.has(memory.id)}
                data-pending={pending}
                data-voice={memory.audio !== null}
                data-reduced={reduced}
                data-link="idle"
                // The camera flies to the orb where it is now.
                onClick={() => onOpen(memory.id, loopRef.current?.positionOf(index) ?? points[index])}
              >
                <span className="mem-drift" aria-hidden="true">
                  <span className="mem-dot" />
                  {memory.thumbUrl !== null && (
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
                  )}
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
