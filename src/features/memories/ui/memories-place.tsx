"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { ensureGambarinoStylesheet } from "@/features/onboarding/font"
import { useReducedMotion } from "@/features/onboarding/reader/use-reduced-motion"
import type { MemoriesFailure, MemoryView } from "../memory-view"
import { DustCanvas } from "./dust-canvas"
import { MemoryPoints } from "./memory-points"
import { MemoryViewer } from "./memory-viewer"

export type MemoriesState =
  | { status: "loading" }
  | { status: "ready"; memories: readonly MemoryView[] }
  | { status: "error"; reason: MemoriesFailure }

interface MemoriesPlaceProps {
  state: MemoriesState
  /** A faint cool tint for the title's glow and the orbs' fallback color. */
  accent?: string
  /** Orb colors; defaults to the accent. */
  palette?: readonly string[]
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

/**
 * The memories space: another dimension, a deep void of its own that fully covers the sky, with round dust
 * drifting through it and one floating orb per memory. It only presents the state it is given; loading it is
 * the container's job, and the way back belongs to the journey.
 */
export function MemoriesPlace({ state, accent, palette, action }: MemoriesPlaceProps) {
  const reduced = useReducedMotion()
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const [viewing, setViewing] = useState<{ id: string | null; origin: { x: number; y: number } }>({
    id: null,
    origin: { x: 0, y: 0 },
  })
  const memories = state.status === "ready" ? state.memories : []

  // The title is Gambarino, which the onboarding normally loads; make sure it is there when arriving straight here.
  useEffect(() => {
    ensureGambarinoStylesheet()
  }, [])

  const restoreFocus = useCallback(
    (id: string) => {
      const points = root?.querySelectorAll<HTMLElement>("[data-memory-id]") ?? []
      for (const point of points) if (point.dataset.memoryId === id) point.focus()
    },
    [root],
  )

  return (
    <div ref={setRoot} className="absolute inset-0 overflow-hidden">
      <div data-void aria-hidden="true" className="mem-void absolute inset-0" />
      <DustCanvas reduced={reduced} />
      <h1
        className="t-title rise-late pointer-events-none absolute bottom-[72px] left-6 m-0 text-[length:var(--type-display)] leading-[0.9] md:left-20"
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
      {memories.length > 0 && (
        <MemoryPoints
          memories={memories}
          palette={palette && palette.length > 0 ? palette : [accent ?? "#cfe9ff"]}
          reduced={reduced}
          onOpen={(id, origin) => setViewing({ id, origin })}
        />
      )}
      {action && <div className="absolute right-6 bottom-[72px] max-md:bottom-[128px]">{typeof action === "function" ? action(root) : action}</div>}
      <MemoryViewer
        memories={memories}
        openId={viewing.id}
        origin={viewing.origin}
        container={root}
        onOpenChange={(id) => setViewing((v) => ({ ...v, id }))}
        onRestoreFocus={restoreFocus}
      />
    </div>
  )
}
