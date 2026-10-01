"use client"

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type Ref } from "react"
import { formatMemoryDate, truncateCaption } from "../format"
import type { MemoryView } from "../memory-view"
import { rimColor } from "../orb-color"
import { approachSizes, ladderOf, PHOTO_RUNGS, pickSize } from "../photo-ladder"
import { focusCamera, focusAmount, orbScale, type Bounds, type Point } from "./camera"
import type { CameraController } from "./camera-controller"
import { startConstellation, type ConstellationLoop } from "./constellation-loop"
import { createSim } from "./constellation-sim"
import { FocusDisc } from "./focus-disc"
import { lensGeometry, OPEN_ZOOM } from "./glass-layout"
import { orbDepth, orbMetrics } from "./orb-depth"
import { createPhotoCache, type PhotoCache } from "./photo-cache"
import { driftFor, layoutPoints } from "./point-layout"
import { buildEdges } from "./similarity"
import { nearestOrb } from "./tap-target"
import { useViewport } from "./use-viewport"

const LABEL_MAX = 28
const STAGGER_MS = 55
const STAGGER_CAP = 24
const WORLD_MARGIN = 70
const CONTENT_PAD = 48
/** An orb that takes focus is brought into the view inside these margins (screen px). */
const VIEW_MARGIN = { top: 100, right: 48, bottom: 150, left: 48 }
/** The orb's photo disc in CSS px at scale 1 (the `.mem-thumb` size). */
const THUMB_PX = 40
/** The canonical ladder, to tell when a zoom crosses into the next size. */
const RUNG_SIZES = PHOTO_RUNGS.map((width) => ({ width, url: String(width) }))

// One cache for a page that mounts the orbs without one (tests, a bare place).
let fallbackCache: PhotoCache | null = null
const sharedCache = () => (fallbackCache ??= createPhotoCache())

/** What the parent can ask of the orbs. */
export interface PointsHandle {
  /** Where the orb of a memory is in the world right now, or null. */
  worldOf: (id: string) => Point | null
  /**
   * Gives focus back to an orb after the glass closed. It is a quiet focus: the keyboard is back where it was, but the
   * orb is not held, lit or opened up (no photo, no dimmed neighbours) until the visitor moves focus themselves.
   */
  restoreFocus: (id: string) => void
}

interface MemoryPointsProps {
  memories: readonly MemoryView[]
  /** The world rectangle the orbs live in, in world px (it grows with the number of memories). */
  bounds: Bounds
  controller: CameraController
  reduced: boolean
  /** The memory the camera is approaching or the glass is open on: it is held still and grows as the camera arrives. */
  approachId: string | null
  /** The glass view is open over the constellation: the loop idles. */
  paused?: boolean
  /** The decoded photos shared with the approach and the glass. */
  cache?: PhotoCache
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
export function MemoryPoints({
  memories,
  bounds,
  controller,
  reduced,
  approachId,
  paused = false,
  cache: given,
  onOpen,
  ref,
}: MemoryPointsProps) {
  const { width, height, dpr } = useViewport()
  const cache = given ?? sharedCache()
  const lens = lensGeometry({ width, height }, dpr)
  const lensRef = useRef(lens)
  useEffect(() => {
    lensRef.current = lens
  })
  // The size the orbs' photos are fetched at: what an orb is drawn at, x DPR. It only ever steps up, so zooming back
  // out keeps the sharper photo the browser already has.
  const [thumbCss, setThumbCss] = useState(() => THUMB_PX * orbScale(controller.camera().zoom))
  const discRef = useRef<HTMLDivElement>(null)
  const approachMemory = approachId === null ? null : (memories.find((m) => m.id === approachId) ?? null)
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
      restoreFocus: (id) => {
        const orb = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-memory-id]") ?? []).find(
          (el) => el.dataset.memoryId === id,
        )
        if (!orb) return
        orb.dataset.quiet = "true"
        orb.focus({ preventScroll: true })
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
      disc: discRef.current,
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
      loop.emphasize(at, at === null ? 0 : focusAmount(controller.camera().zoom, OPEN_ZOOM), lensRef.current.diameter)
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
    // Intent: a pointer resting on an orb, a focus or a finger down warms the sizes the approach will need.
    const warm = (at: number | null) => {
      const memory = at === null ? undefined : memories[at]
      if (!memory) return
      const sizes = approachSizes(ladderOf(memory), lensRef.current.diameter, lensRef.current.dpr)
      if (sizes.length > 0) cache.warm(sizes)
    }
    const onOver = (event: PointerEvent) => {
      const at = orbAt(event.target)
      loop.hold("hover", at)
      if (event.pointerType !== "touch") warm(at)
    }
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.pointerType === "pen") warm(orbAt(event.target))
    }
    const onOut = (event: PointerEvent) => {
      if (orbAt(event.relatedTarget) === null) loop.hold("hover", null)
    }
    // Tabbing to an orb that is off screen brings it into view.
    const onFocusIn = (event: FocusEvent) => {
      // Focus given back after the glass closed is not the visitor exploring: the overview stays as it was.
      if ((event.target as HTMLElement | null)?.dataset?.quiet === "true") return
      const at = orbAt(event.target)
      loop.hold("focus", at)
      warm(at)
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
    const onFocusOut = (event: FocusEvent) => {
      ;(event.target as HTMLElement | null)?.removeAttribute?.("data-quiet")
      loop.hold("focus", null)
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return
      const rect = list.getBoundingClientRect()
      loop.pointer({ x: event.clientX - rect.left, y: event.clientY - rect.top })
    }
    const onLeave = () => loop.pointer(null)
    list.addEventListener("pointerover", onOver)
    list.addEventListener("pointerdown", onDown)
    list.addEventListener("pointerout", onOut)
    list.addEventListener("focusin", onFocusIn)
    list.addEventListener("focusout", onFocusOut)
    window.addEventListener("pointermove", onMove, { passive: true })
    document.documentElement.addEventListener("mouseleave", onLeave)

    return () => {
      unsubscribe()
      list.removeEventListener("pointerover", onOver)
      list.removeEventListener("pointerdown", onDown)
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
  }, [memories, points, edges, bounds, controller, reduced, cache])

  // Zooming in draws the orbs bigger: their photos step up to the size that keeps them sharp (never down, and not
  // while the camera flies to an orb, where only the approached one shows a photo).
  const thumbRef = useRef(thumbCss)
  const approachingRef = useRef(approachId !== null)
  useEffect(() => {
    approachingRef.current = approachId !== null
  }, [approachId])
  useEffect(
    () =>
      controller.subscribe(() => {
        if (approachingRef.current) return
        const need = THUMB_PX * orbScale(controller.camera().zoom)
        const now = pickSize(RUNG_SIZES, thumbRef.current, dpr)?.width ?? 0
        if ((pickSize(RUNG_SIZES, need, dpr)?.width ?? 0) > now) {
          thumbRef.current = need
          setThumbCss(need)
        }
      }),
    [controller, dpr],
  )

  // While the glass is open the loop idles. The same deps as the loop's own effect, so a rebuilt loop gets it too.
  useEffect(() => {
    loopRef.current?.pause(paused)
  }, [paused, memories, points, edges, bounds, controller, reduced])

  // The approach (the camera flying to an orb, the glass open on it, the way back) holds that orb and grows it.
  useEffect(() => {
    approachRef.current = approachId
    const loop = loopRef.current
    if (!loop) return
    const at = approachId === null ? null : (indexById.current.get(approachId) ?? null)
    approachIndex.current = at
    loop.hold("approach", at)
    loop.emphasize(at, at === null ? 0 : focusAmount(controller.camera().zoom, OPEN_ZOOM), lensRef.current.diameter)
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
      <ul
        ref={listRef}
        aria-label="Recuerdos"
        className="pointer-events-none absolute inset-0 m-0 list-none p-0"
        // On a phone the overview packs orbs closer than a fingertip, so their hit areas overlap and the browser
        // hands the tap to the one drawn on top. A touch (or pen) tap goes to the orb whose center is nearest.
        onClickCapture={(event) => {
          const type = (event.nativeEvent as PointerEvent).pointerType
          if (type !== "touch" && type !== "pen") return
          const hit = (event.target as Element).closest?.("[data-memory-id]")
          if (!hit) return
          const centers = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-memory-id]") ?? [], (el) => {
            const box = el.getBoundingClientRect()
            return { id: el.dataset.memoryId ?? "", x: box.x + box.width / 2, y: box.y + box.height / 2 }
          })
          const id = nearestOrb({ x: event.clientX, y: event.clientY }, centers)
          if (id === null || id === (hit as HTMLElement).dataset.memoryId) return
          const index = indexById.current.get(id)
          if (index === undefined) return
          event.stopPropagation()
          event.preventDefault()
          onOpen(id, loopRef.current?.positionOf(index) ?? points[index])
        }}
      >
        {memories.map((memory, index) => {
          const orb = orbMetrics(orbDepth(memory.id))
          const drift = driftFor(memory.id)
          const date = formatMemoryDate(memory.happenedOn)
          const pending = memory.status === "pending"
          const thumb = pickSize(ladderOf(memory), thumbCss, dpr)?.url ?? null
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
                data-ready={thumb === null || ready.has(memory.id)}
                data-pending={pending}
                data-voice={memory.audio !== null}
                data-reduced={reduced}
                data-link="idle"
                // The camera flies to the orb where it is now.
                onClick={() => onOpen(memory.id, loopRef.current?.positionOf(index) ?? points[index])}
              >
                <span className="mem-drift" aria-hidden="true">
                  <span className="mem-dot" />
                  {thumb !== null && (
                    <span className="mem-thumb">
                      {/* A signed Cloudinary crop already at the size the orb is drawn (x DPR); next/image would only re-proxy it. */}
                      {/* CORS, so it is the very same cached response the approach and the glass read. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumb}
                        alt=""
                        crossOrigin="anonymous"
                        // A cached or server-rendered image can finish before React attaches onLoad.
                        ref={(img) => {
                          if (!img?.complete) return
                          markReady(memory.id)
                          if (img.naturalWidth > 0) cache.adopt(thumb, img)
                        }}
                        decoding="async"
                        draggable={false}
                        onLoad={(event) => {
                          markReady(memory.id)
                          cache.adopt(thumb, event.currentTarget)
                        }}
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
      <FocusDisc ref={discRef} memory={approachMemory} cache={cache} diameter={lens.diameter} dpr={lens.dpr} />
    </>
  )
}
