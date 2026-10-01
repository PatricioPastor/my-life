"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react"
import { ensureGambarinoStylesheet } from "@/features/onboarding/font"
import { useReducedMotion } from "@/features/onboarding/reader/use-reduced-motion"
import type { MemoriesFailure, MemoryView } from "../memory-view"
import { orderByDate } from "./approach"
import { parallaxOffset, worldBounds } from "./camera"
import { createCameraController } from "./camera-controller"
import { DustCanvas } from "./dust-canvas"
import { GlassView } from "./glass-view"
import { MemoryPoints, type PointsHandle } from "./memory-points"
import { useApproach } from "./use-approach"
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
}

const PORCELAIN = "#f3f0ea"
const MESSAGE_CLASS =
  "t-body rise absolute inset-x-6 top-1/2 m-0 -translate-y-1/2 text-center text-[length:var(--type-2)] text-ink-muted"
const FAILURE_COPY: Record<MemoriesFailure, string> = {
  no_session: "Vuelve a entrar para ver los recuerdos.",
  unavailable: "No pudimos cargar los recuerdos.",
}
const SPACE_LABEL = "Recuerdos. Arrastra para moverte y usa la rueda para acercar. Con el teclado: flechas para moverte, más y menos para acercar, cero para verlo todo."
/** What the first fit leaves clear for the HUD: the back control on top, the title and the add control below. */
const FIT_PAD = { top: 96, right: 28, bottom: 168, left: 28 }
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
export function MemoriesPlace({ state, accent, action }: MemoriesPlaceProps) {
  const reduced = useReducedMotion()
  const viewport = useViewport()
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const memories = useMemo(() => (state.status === "ready" ? state.memories : []), [state])
  // The world's shape is fixed by the viewport the space was first seen on, so a resize never reseeds the orbs.
  const [aspect] = useState(() => viewport.width / viewport.height)
  const bounds = useMemo(() => worldBounds(memories.length, aspect), [memories.length, aspect])
  const [controller] = useState(() => createCameraController({ reduced, viewport, bounds, pad: FIT_PAD }))
  const points = useRef<PointsHandle>(null)
  const ordered = useMemo(() => orderByDate(memories), [memories])
  const approach = useApproach(controller, ordered, points)
  const current = approach.state
  const open = current.phase === "open" ? (memories.find((m) => m.id === current.id) ?? null) : null

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

  const restoreFocus = useCallback(
    (id: string) => {
      const orbs = root?.querySelectorAll<HTMLElement>("[data-memory-id]") ?? []
      for (const orb of orbs) if (orb.dataset.memoryId === id) orb.focus()
    },
    [root],
  )

  // Escape on the stage (focus on an orb, or the glass not open yet) turns the camera back, as it does from the glass.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !(event.target as Element).closest?.("[role='dialog']")) approach.close()
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
        <DustCanvas reduced={reduced} camera={controller} />
        {memories.length > 0 && (
          <MemoryPoints
            ref={points}
            memories={memories}
            bounds={bounds}
            controller={controller}
            reduced={reduced}
            approachId={approach.state.phase === "idle" ? null : approach.state.id}
            onOpen={approach.open}
          />
        )}
      </div>
      <h1
        className="t-title rise-late pointer-events-none absolute bottom-[calc(72px+env(safe-area-inset-bottom))] left-6 m-0 text-[length:var(--type-display)] leading-[0.9] md:left-20"
        style={{
          color: PORCELAIN,
          textShadow: `0 0 36px color-mix(in oklab, ${accent ?? "#a8c8ff"} 22%, transparent)`,
        }}
      >
        Recuerdos
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
          className="absolute right-6 bottom-[calc(72px+env(safe-area-inset-bottom))] max-md:bottom-[calc(128px+env(safe-area-inset-bottom))]"
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
        onClose={approach.close}
        onRestoreFocus={restoreFocus}
      />
    </div>
  )
}
