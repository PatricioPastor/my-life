"use client"

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react"
import { Dialog } from "radix-ui"
import { probeRenderer } from "@/features/onboarding/gpu-probe"
import { formatMemoryDate } from "../format"
import type { MemoryView } from "../memory-view"
import type { Viewport } from "./camera"
import { glassLayout } from "./glass-layout"
import { formatClock, pickGlassMode } from "./glass-mode"
import { GlassOrb } from "./glass-orb"
import { swipeStep } from "./swipe"
import { useVoiceLevel } from "./voice-level"

interface GlassViewProps {
  /** The memory the glass is open on, or null when closed. */
  memory: MemoryView | null
  prev: MemoryView | null
  next: MemoryView | null
  /** The element the dialog mounts into, so it stays inside the stage (and its cursor). */
  container: HTMLElement | null
  reduced: boolean
  viewport: Viewport
  /** Another memory to fly to (the arrows, the buttons, a swipe). */
  onStep: (id: string) => void
  onClose: () => void
  /** Called once the dialog has closed, to put focus back on the orb that was opened. */
  onRestoreFocus: (id: string) => void
}

const Chevron = ({ flip }: { flip?: boolean }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden="true"
    style={flip ? { transform: "scaleX(-1)" } : undefined}
  >
    <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
  </svg>
)

const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M5 3.2v11.6L15 9z" fill="currentColor" />
  </svg>
)
const PauseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M4.5 3h3.4v12H4.5zM10.1 3h3.4v12h-3.4z" fill="currentColor" />
  </svg>
)

type VoiceStatus = "idle" | "playing" | "error"
type SphereStyle = CSSProperties & Record<`--${string}`, string>

/** What is inside the dialog for one memory: the sphere, its voice, and the caption floating below it. */
function GlassBody({
  memory,
  prev,
  next,
  reduced,
  viewport,
  onStep,
  open,
}: Pick<GlassViewProps, "prev" | "next" | "reduced" | "viewport" | "onStep"> & { memory: MemoryView; open: boolean }) {
  const [failed, setFailed] = useState(false)
  const onFail = useCallback(() => setFailed(true), [])
  const mode = pickGlassMode({ webgl2: probeRenderer().webgl2, failed })

  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  const [status, setStatus] = useState<VoiceStatus>("idle")
  const level = useVoiceLevel(audio)
  // The voice stops when the memory does: on another memory, on close, on leaving.
  useEffect(() => {
    if (!open) audio?.pause()
  }, [open, audio])
  useEffect(() => {
    const el = audio
    return () => el?.pause()
  }, [audio])

  const toggle = () => {
    if (!audio) return
    if (status === "playing") audio.pause()
    else audio.play().catch(() => setStatus("error"))
  }

  const swipeFrom = useRef<{ x: number; y: number } | null>(null)
  const onSwipeEnd = (event: PointerEvent) => {
    const start = swipeFrom.current
    swipeFrom.current = null
    if (!start) return
    const step = swipeStep(event.clientX - start.x, event.clientY - start.y)
    const target = step === 1 ? next : step === -1 ? prev : null
    if (target) onStep(target.id)
  }

  const { diameter, anchor } = glassLayout(viewport)
  const sphere: SphereStyle = {
    "--pc": memory.orbColor,
    width: diameter,
    height: diameter,
    left: "50%",
    top: `${(anchor.y * 100).toFixed(2)}%`,
    marginLeft: -diameter / 2,
    marginTop: -diameter / 2,
  }
  const pending = memory.status === "pending"

  return (
    <>
      <div
        data-glass-sphere
        data-glass={mode}
        data-reduced={reduced}
        data-voice={memory.audio !== null}
        className="mem-glass-sphere pointer-events-auto absolute touch-none"
        style={sphere}
        onPointerDown={(event) => {
          swipeFrom.current = { x: event.clientX, y: event.clientY }
        }}
        onPointerUp={onSwipeEnd}
        onPointerCancel={() => {
          swipeFrom.current = null
        }}
      >
        <GlassOrb memory={memory} mode={mode} reduced={reduced} level={level} diameter={diameter} onFail={onFail} />
        {memory.audio && (
          <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 translate-y-1/2 items-center gap-3">
            <button
              type="button"
              disabled={status === "error"}
              aria-pressed={status === "error" ? undefined : status === "playing"}
              aria-label={status === "error" ? "Audio no disponible" : status === "playing" ? "Pausar audio" : "Reproducir audio"}
              data-magnetic="light"
              data-cursor-label={status === "playing" ? "Pausar" : "Escuchar"}
              data-state={status}
              className="mem-glass-play press flex size-14 items-center justify-center rounded-full text-ink"
              onClick={toggle}
            >
              {status === "playing" ? <PauseIcon /> : <PlayIcon />}
            </button>
            <span className="text-xs tracking-[0.08em] text-ink-muted tabular-nums">{formatClock(memory.audio.durationMs)}</span>
          </div>
        )}
      </div>
      {memory.audio && (
        // `crossOrigin` lets Web Audio read it (the signed Cloudinary response must allow CORS); without it a browser mutes it.
        <audio
          ref={setAudio}
          src={memory.audio.url}
          crossOrigin="anonymous"
          preload="metadata"
          onPlay={() => setStatus("playing")}
          onPause={() => setStatus((s) => (s === "error" ? s : "idle"))}
          onEnded={() => setStatus("idle")}
          onError={() => setStatus("error")}
        />
      )}
      <div
        className="pointer-events-none absolute left-1/2 flex w-full max-w-[640px] -translate-x-1/2 items-center justify-between gap-3 px-3"
        style={{ top: `calc(${(anchor.y * 100).toFixed(2)}% + ${Math.round(diameter / 2 + (memory.audio ? 64 : 40))}px)` }}
      >
        <button
          type="button"
          aria-label="Anterior"
          disabled={!prev}
          data-magnetic="light"
          data-cursor-label="Anterior"
          className="press pointer-events-auto flex size-12 shrink-0 items-center justify-center text-ink-muted"
          onClick={() => prev && onStep(prev.id)}
        >
          <Chevron />
        </button>
        <div className="min-w-0 text-center">
          <Dialog.Title className="t-title m-0 text-[length:var(--type-3)] text-ink">{memory.caption}</Dialog.Title>
          <p id="memory-glass-date" className="m-0 mt-1.5 text-xs tracking-[0.08em] text-ink-muted">
            {formatMemoryDate(memory.happenedOn)}
          </p>
          {memory.place?.name && <p className="m-0 mt-0.5 text-[11px] tracking-[0.06em] text-ink-faint">{memory.place.name}</p>}
          {pending && <p className="m-0 mt-1 text-xs tracking-[0.08em] text-ink-muted">Pendiente de aprobación</p>}
        </div>
        <button
          type="button"
          aria-label="Siguiente"
          disabled={!next}
          data-magnetic="light"
          data-cursor-label="Siguiente"
          className="press pointer-events-auto flex size-12 shrink-0 items-center justify-center text-ink-muted"
          onClick={() => next && onStep(next.id)}
        >
          <Chevron flip />
        </button>
      </div>
    </>
  )
}

/**
 * The glass view: a memory held in a glass sphere that the camera has flown up to, with its caption, date and place
 * floating below. A dialog (Esc, the close button, zooming out, a click on the empty stage all close it; the arrows,
 * the buttons and a swipe fly to the neighbours) so focus is managed and the rest of the stage is hidden from the
 * cursor and from assistive technology. It keeps the last memory on screen while it fades out.
 */
export function GlassView({ memory, prev, next, container, reduced, viewport, onStep, onClose, onRestoreFocus }: GlassViewProps) {
  // The last memory stays on screen while the dialog fades out (and tells where focus goes back to).
  const [held, setHeld] = useState<MemoryView | null>(memory)
  if (memory && memory !== held) setHeld(memory)
  const shown = memory ?? held

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft" && prev) {
      event.preventDefault()
      onStep(prev.id)
    } else if (event.key === "ArrowRight" && next) {
      event.preventDefault()
      onStep(next.id)
    }
  }
  // Zooming out on the stage (a wheel away from the sphere) leaves it, as the way back is a zoom out.
  const onWheel = (event: { deltaY: number }) => {
    if (event.deltaY > 0) onClose()
  }

  return (
    <Dialog.Root open={memory !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="mem-scrim absolute inset-0 bg-[#020207]/70" onWheel={onWheel} />
        <Dialog.Content
          aria-describedby="memory-glass-date"
          className="mem-glass absolute inset-0 outline-none"
          // Only the sphere and the controls take pointers: a press on the empty stage falls through to the scrim and closes.
          style={{ pointerEvents: "none" }}
          onKeyDown={onKeyDown}
          onWheel={onWheel}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            // By now the dialog has closed and `memory` is null, so use the last memory that was on screen.
            if (held) onRestoreFocus(held.id)
          }}
        >
          {shown && (
            <>
              <Dialog.Close
                data-magnetic="light"
                data-cursor-label="Cerrar"
                className="press pointer-events-auto absolute top-[max(1.25rem,calc(env(safe-area-inset-top)+0.25rem))] right-[max(1.25rem,calc(env(safe-area-inset-right)+0.25rem))] flex h-12 items-center px-3 text-xs tracking-[0.08em] text-ink-muted"
              >
                Cerrar
              </Dialog.Close>
              <GlassBody
                key={shown.id}
                memory={shown}
                open={memory !== null}
                prev={memory ? prev : null}
                next={memory ? next : null}
                reduced={reduced}
                viewport={viewport}
                onStep={onStep}
              />
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
