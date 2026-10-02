"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react"
import { ensureGambarinoStylesheet } from "@/features/onboarding/font"
import { useReducedMotion } from "@/features/onboarding/reader/use-reduced-motion"
import type { MemoriesFailure, MemoryView } from "../memory-view"
import { approachSizes, ladderOf } from "../photo-ladder"
import type { ShareMemoryResult } from "../share/share-view"
import { orderByDate } from "./approach"
import { parallaxOffset, worldBounds } from "./camera"
import { createCameraController } from "./camera-controller"
import { DustCanvas } from "./dust-canvas"
import { lensGeometry } from "./glass-layout"
import { GlassView } from "./glass-view"
import { createLens, type Lens } from "./lens"
import { MemoryPoints, type PointsHandle } from "./memory-points"
import { createPhotoCache } from "./photo-cache"
import { useApproach } from "./use-approach"
import { useTitle } from "./use-title"
import { useViewport } from "./use-viewport"
import { VOID_GLOWS } from "./void-glows"

export type MemoriesState =
  | { status: "loading" }
  | { status: "ready"; memories: readonly MemoryView[] }
  | { status: "error"; reason: MemoriesFailure }

interface MemoriesPlaceProps {
  state: MemoriesState
  /** A faint cool tint for the title's glow. */
  accent?: string
  /**
   * The "Agregar recuerdo" control, in the bottom-right corner the layout keeps clear. A function receives the
   * stage element, so a dialog it opens can mount inside it (and keep the magnetic cursor).
   */
  action?: ReactNode | ((container: HTMLElement | null) => ReactNode)
  /**
   * A guest with a share link: the one memory opens by itself, and leaving it (Esc, Cerrar, "Universo") calls
   * `onExit` (the start) instead of flying back to the overview. There is no previous or next.
   */
  guest?: { memoryId: string; onExit: () => void }
  /** Asks for the link to share a memory; the glass offers "Compartir" for approved ones when it is given. */
  share?: (id: string) => Promise<ShareMemoryResult>
}

const PORCELAIN = "#f3f0ea"
const MESSAGE_CLASS =
  "t-body rise absolute inset-x-6 top-1/2 m-0 -translate-y-1/2 text-center text-[length:var(--type-2)] text-ink-muted"
const FAILURE_COPY: Record<MemoriesFailure, string> = {
  no_session: "Vuelve a entrar para ver los recuerdos.",
  unavailable: "No pudimos cargar los recuerdos.",
}
const SPACE_LABEL = "Recuerdos. Arrastra para moverte y usa la rueda para acercar. Con el teclado: flechas para moverte, más y menos para acercar, cero para verlo todo."
/** What the first fit leaves clear for the HUD: the way back and the title's label on top, the large title and the add control below. */
const FIT_PAD = { top: 112, right: 28, bottom: 168, left: 28 }
/** The large title at the bottom left, and the label it becomes, under the way back ("Universo"). */
const TITLE_HERO =
  "bottom-[calc(72px+env(safe-area-inset-bottom))] left-[max(1.5rem,calc(env(safe-area-inset-left)+0.5rem))] text-[length:var(--type-display)] leading-[0.9] md:left-[max(5rem,calc(env(safe-area-inset-left)+0.5rem))]"
const TITLE_LABEL =
  "top-[calc(max(1.75rem,calc(env(safe-area-inset-top)+0.5rem))+2.5rem)] left-[calc(max(2.25rem,calc(env(safe-area-inset-left)+0.5rem))+0.75rem)] text-[length:var(--type-2)] leading-[1.1]"
/** Under reduced motion a camera move is a cut: the world fades out for this long, swaps, and fades back. */
const CUT_OUT_MS = 110
const CUT_IN_MS = 140

/**
 * The memories space: another dimension, a deep void of its own that fully covers the sky, with round dust drifting
 * through it and one floating orb per memory, on a canvas you move through (drag, wheel, pinch, keys). Activating an
 * orb flies the camera to it and opens it as a glass sphere; closing flies back. It only presents the state it is
 * given; loading it is the container's job, and the way back belongs to the journey. The title, the add control and
 * the dialogs are a HUD: they never move with the camera.
 */
export function MemoriesPlace({ state, accent, action, guest, share }: MemoriesPlaceProps) {
  const reduced = useReducedMotion()
  const viewport = useViewport()
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const memories = useMemo(() => (state.status === "ready" ? state.memories : []), [state])
  // The world's shape is fixed by the viewport the space was first seen on, so a resize never reseeds the orbs.
  const [aspect] = useState(() => viewport.width / viewport.height)
  const bounds = useMemo(() => worldBounds(memories.length, aspect), [memories.length, aspect])
  const [controller] = useState(() => createCameraController({ reduced, viewport, bounds, pad: FIT_PAD }))
  const points = useRef<PointsHandle>(null)
  // Every photo the space shows is fetched and decoded once, here, and shared by the orbs, the approach and the glass.
  const [photos] = useState(() => createPhotoCache())
  // The glass sphere's canvas and renderer live as long as the space: compiled ahead of time, never on the frame the
  // glass opens (there is no document while rendering on the server).
  const [glass] = useState<Lens | null>(() => (typeof document === "undefined" ? null : createLens({ cache: photos })))
  const lens = lensGeometry(viewport, viewport.dpr)
  const lensRef = useRef(lens)
  useEffect(() => {
    lensRef.current = lens
  })
  const anchor = useCallback(() => lensRef.current.anchor, [])
  const ordered = useMemo(() => orderByDate(memories), [memories])
  const approach = useApproach(controller, ordered, points, anchor)
  const current = approach.state
  // The glass stays open while the camera carries the world to another memory.
  const glassOn = current.phase === "open" || current.phase === "switching"
  const open = glassOn ? (memories.find((m) => m.id === current.id) ?? null) : null
  // How far a switch has come: the glass dissolves and the caption changes in step with it.
  const phaseRef = useRef(current.phase)
  useEffect(() => {
    phaseRef.current = current.phase
  }, [current.phase])
  const travel = useCallback(() => (phaseRef.current === "switching" ? controller.progress() : null), [controller])
  const titleRef = useRef<HTMLHeadingElement>(null)
  const title = useTitle(current.phase, reduced, titleRef)
  const approached = current.phase === "idle" ? null : (memories.find((m) => m.id === current.id) ?? null)

  // A guest arrives with the memory in hand: the camera flies to it, once, as if its orb had been tapped.
  const opened = useRef(false)
  const guestId = guest?.memoryId
  const { open: openApproach } = approach
  useEffect(() => {
    if (!guestId || opened.current || !memories.some((m) => m.id === guestId)) return
    opened.current = true
    openApproach(guestId)
  })

  // Build the glass renderer when the browser is idle; dispose of it with the space.
  useEffect(() => {
    if (!glass) return
    const idle = window.requestIdleCallback?.(() => glass.prepare(), { timeout: 1500 })
    const fallback = idle === undefined ? window.setTimeout(() => glass.prepare(), 300) : 0
    return () => {
      if (idle !== undefined) window.cancelIdleCallback?.(idle)
      window.clearTimeout(fallback)
      glass.dispose()
    }
  }, [glass])

  // The lens canvas is sized ahead of time too (allocating its drawing buffer is not free), and again on a resize.
  useEffect(() => {
    glass?.resize({ device: lens.canvas.device, deviceDiameter: Math.round(lens.diameter * lens.dpr), diameter: lens.diameter, dpr: lens.dpr })
  }, [glass, lens.canvas.device, lens.diameter, lens.dpr])

  // The flight has begun: the glass gets ready to hold this memory (its photo uploads while the camera flies).
  useEffect(() => {
    if (!glass || !approached) return
    glass.prepare()
    glass.show(approached)
  }, [glass, approached])

  // The title is Gambarino, which the onboarding normally loads; make sure it is there when arriving straight here.
  useEffect(() => {
    ensureGambarinoStylesheet()
  }, [])

  useEffect(() => {
    controller.setReduced(reduced)
  }, [controller, reduced])

  // Pointer, wheel and keyboard drive the camera from the stage.
  useEffect(() => (root ? controller.attach(root) : undefined), [root, controller])

  // Under reduced motion the camera cuts: the world fades out, swaps, and fades back in.
  useEffect(() => {
    if (!root) return
    let out = 0
    let back = 0
    controller.setCut((apply) => {
      // A newer cut replaces the one in progress: only the latest swap happens.
      window.clearTimeout(out)
      window.clearTimeout(back)
      root.dataset.cut = "out"
      out = window.setTimeout(() => {
        apply()
        root.dataset.cut = "in"
        back = window.setTimeout(() => root.removeAttribute("data-cut"), CUT_IN_MS)
      }, CUT_OUT_MS)
    })
    return () => {
      window.clearTimeout(out)
      window.clearTimeout(back)
      root.removeAttribute("data-cut")
      controller.setCut((apply) => apply())
    }
  }, [root, controller])

  // The glows sit far behind the orbs: they follow the camera by a small share (depth parallax).
  useEffect(() => {
    if (!root) return
    const layers = Array.from(root.querySelectorAll<HTMLElement>("[data-parallax]"))
    return controller.subscribe(() => {
      const cam = controller.camera()
      const home = controller.home()
      for (const layer of layers) {
        const shift = parallaxOffset(cam, home, Number(layer.dataset.parallax))
        layer.style.transform = `translate3d(${shift.x.toFixed(2)}px, ${shift.y.toFixed(2)}px, 0)`
      }
    })
  }, [root, controller])

  // The keyboard goes back to the orb that was opened, quietly: the overview must look exactly as it did before.
  const restoreFocus = useCallback((id: string) => points.current?.restoreFocus(id), [])
  const warm = useCallback(
    (memory: MemoryView) => {
      const sizes = approachSizes(ladderOf(memory), lens.diameter, lens.dpr)
      if (sizes.length > 0) photos.warm(sizes)
    },
    [photos, lens.diameter, lens.dpr],
  )

  // Escape on the stage (focus on an orb, or the glass not open yet) turns the camera back, as it does from the glass.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !(event.target as Element).closest?.("[role='dialog']")) (guest ? guest.onExit : approach.close)()
  }

  return (
    <div
      ref={setRoot}
      role="group"
      aria-label={SPACE_LABEL}
      tabIndex={0}
      data-approach={approach.state.phase}
      className="mem-stage absolute inset-0 overflow-hidden outline-none"
      onKeyDown={onKeyDown}
    >
      <div data-void data-reduced={reduced} aria-hidden="true" className="mem-void absolute inset-0 overflow-hidden">
        {VOID_GLOWS.map((glow, i) => (
          <span key={glow.color} data-parallax={glow.depth} className="absolute inset-0 will-change-transform">
            <span
              className="mem-glow"
              style={
                {
                  "--glow": glow.color,
                  "--glow-tint": glow.tint,
                  "--glow-alpha": glow.alpha,
                  "--glow-x": `${glow.x}%`,
                  "--glow-y": `${glow.y}%`,
                  "--glow-size": `${glow.size}vmax`,
                  "--glow-dx": `${glow.travelX}vw`,
                  "--glow-dy": `${glow.travelY}vh`,
                  "--glow-dur": `${glow.duration}s`,
                  "--glow-delay": `${glow.delay}s`,
                  "--glow-i": i,
                } as CSSProperties
              }
            />
          </span>
        ))}
      </div>
      <div data-world className="mem-world pointer-events-none absolute inset-0">
        <DustCanvas reduced={reduced} camera={controller} paused={current.phase === "open"} />
        {memories.length > 0 && (
          <MemoryPoints
            ref={points}
            memories={memories}
            bounds={bounds}
            controller={controller}
            reduced={reduced}
            approachId={approach.state.phase === "idle" ? null : approach.state.id}
            approachPhase={approach.state.phase}
            paused={current.phase === "open"}
            cache={photos}
            onOpen={approach.open}
          />
        )}
      </div>
      <h1
        ref={titleRef}
        data-title={title.mode}
        data-fading={title.fading}
        data-hidden={title.hidden}
        className={`mem-title t-title pointer-events-none absolute m-0 ${title.mode === "hero" ? TITLE_HERO : TITLE_LABEL}`}
        style={{
          color: PORCELAIN,
          textShadow: `0 0 ${title.mode === "hero" ? 36 : 14}px color-mix(in oklab, ${accent ?? "#a8c8ff"} 22%, transparent)`,
        }}
      >
        {/* The rise on arrival lives on the word, so it never fights the FLIP on the heading. */}
        <span className="rise-late inline-block">Recuerdos</span>
      </h1>
      {state.status === "loading" && (
        <p role="status" className={MESSAGE_CLASS}>
          Cargando recuerdos…
        </p>
      )}
      {state.status === "error" && (
        <p role="status" className={MESSAGE_CLASS}>
          {FAILURE_COPY[state.reason]}
        </p>
      )}
      {state.status === "ready" && memories.length === 0 && (
        <p role="status" className={MESSAGE_CLASS}>
          Todavía no hay recuerdos.
        </p>
      )}
      {action && (
        <div
          data-hud
          className="absolute right-[max(1.5rem,calc(env(safe-area-inset-right)+0.5rem))] bottom-[calc(72px+env(safe-area-inset-bottom))] max-md:bottom-[calc(128px+env(safe-area-inset-bottom))]"
        >
          {typeof action === "function" ? action(root) : action}
        </div>
      )}
      <GlassView
        memory={open}
        prev={approach.neighbor(-1)}
        next={approach.neighbor(1)}
        container={root}
        reduced={reduced}
        viewport={viewport}
        onStep={approach.step}
        onClose={guest ? guest.onExit : approach.close}
        guestExit={guest?.onExit}
        share={share}
        onRestoreFocus={restoreFocus}
        onWarm={warm}
        lens={glass}
        travel={travel}
        switching={current.phase === "switching"}
      />
    </div>
  )
}
