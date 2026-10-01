"use client"

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { Dialog } from "radix-ui"
import { formatMemoryDate } from "../format"
import type { MemoryView } from "../memory-view"
import { swipeStep } from "./swipe"

interface MemoryViewerProps {
  memories: readonly MemoryView[]
  /** The memory being viewed, or null when closed. */
  openId: string | null
  /** Where the memory's point sits on the stage: the viewer opens out of it. */
  origin: { x: number; y: number }
  /** The element the dialog mounts into, so it stays inside the stage (and its cursor). */
  container: HTMLElement | null
  /** Called with another memory's id to move to it, or null to close. */
  onOpenChange: (id: string | null) => void
  /** Called when the dialog has closed, to put focus back on the point that was being viewed. */
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

function Photo({ memory }: { memory: MemoryView }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div
      data-photo-frame
      className="relative max-w-full overflow-hidden rounded-sm bg-ink-faint/30"
      style={{
        aspectRatio: `${memory.width} / ${memory.height}`,
        width: `min(100%, calc((100svh - 200px) * ${memory.width / memory.height}))`,
      }}
    >
      {/* Full-size Cloudinary delivery URL (f_auto, q_auto, w_1600): already optimized at the source. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={memory.fullUrl}
        alt={memory.caption}
        data-loaded={loaded}
        className="size-full object-contain opacity-0 transition-opacity duration-200 ease-out data-[loaded=true]:opacity-100"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </div>
  )
}

/** The photo, the caption and the date of one memory, in a modal that opens out of its point. */
export function MemoryViewer({ memories, openId, origin, container, onOpenChange, onRestoreFocus }: MemoryViewerProps) {
  const lastId = useRef<string | null>(null)
  useEffect(() => {
    if (openId) lastId.current = openId
  }, [openId])
  const index = memories.findIndex((m) => m.id === openId)
  const memory = index >= 0 ? memories[index] : null
  const prev = index > 0 ? memories[index - 1] : null
  const next = index >= 0 && index < memories.length - 1 ? memories[index + 1] : null

  // A swipe turns the page, the way a photo viewer does on a phone (the arrows stay for everyone else).
  const swipeFrom = useRef<{ x: number; y: number } | null>(null)
  const onSwipeEnd = (event: PointerEvent) => {
    const start = swipeFrom.current
    swipeFrom.current = null
    if (!start) return
    const step = swipeStep(event.clientX - start.x, event.clientY - start.y)
    const target = step === 1 ? next : step === -1 ? prev : null
    if (target) onOpenChange(target.id)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft" && prev) {
      event.preventDefault()
      onOpenChange(prev.id)
    } else if (event.key === "ArrowRight" && next) {
      event.preventDefault()
      onOpenChange(next.id)
    }
  }

  return (
    <Dialog.Root open={memory !== null} onOpenChange={(open) => !open && onOpenChange(null)}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="mem-scrim absolute inset-0 bg-[#020207]/85" />
        <Dialog.Content
          aria-describedby="memory-viewer-date"
          className="mem-viewer absolute inset-0 flex flex-col items-center justify-center gap-4 p-4 outline-none md:p-8"
          // The card is the only part that takes pointers: a press on the empty stage falls through to the scrim and closes.
          style={{ transformOrigin: `${origin.x}px ${origin.y}px`, pointerEvents: "none" }}
          onKeyDown={onKeyDown}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            // By now the dialog has closed and openId is null, so use the last memory that was on screen.
            if (lastId.current) onRestoreFocus(lastId.current)
          }}
        >
          {memory && (
            <>
              <Dialog.Close
                data-magnetic="light"
                data-cursor-label="Cerrar"
                className="press pointer-events-auto absolute top-[max(1.25rem,calc(env(safe-area-inset-top)+0.25rem))] right-[max(1.25rem,calc(env(safe-area-inset-right)+0.25rem))] flex h-12 items-center px-3 text-xs tracking-[0.08em] text-ink-muted"
              >
                Cerrar
              </Dialog.Close>
              <div
                className="pointer-events-auto flex max-h-full w-full max-w-[1100px] touch-none flex-col items-center gap-4"
                onPointerDown={(event) => {
                  swipeFrom.current = { x: event.clientX, y: event.clientY }
                }}
                onPointerUp={onSwipeEnd}
                onPointerCancel={() => {
                  swipeFrom.current = null
                }}
              >
                <Photo key={memory.id} memory={memory} />
                <div className="flex w-full max-w-[640px] items-center justify-between gap-3">
                  <button
                    type="button"
                    aria-label="Anterior"
                    disabled={!prev}
                    data-magnetic="light"
                    data-cursor-label="Anterior"
                    className="press flex size-12 shrink-0 items-center justify-center text-ink-muted"
                    onClick={() => prev && onOpenChange(prev.id)}
                  >
                    <Chevron />
                  </button>
                  <div className="min-w-0 text-center">
                    <Dialog.Title className="t-body m-0 text-[length:var(--type-2)] text-ink">{memory.caption}</Dialog.Title>
                    <p id="memory-viewer-date" className="m-0 mt-1 text-xs tracking-[0.08em] text-ink-muted">
                      {formatMemoryDate(memory.happenedOn)}
                    </p>
                    {memory.place?.name && (
                      <p className="m-0 mt-0.5 text-[11px] tracking-[0.06em] text-ink-faint">{memory.place.name}</p>
                    )}
                    {memory.status === "pending" && (
                      <p className="m-0 mt-1 text-xs tracking-[0.08em] text-ink-muted">Pendiente de aprobación</p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Siguiente"
                    disabled={!next}
                    data-magnetic="light"
                    data-cursor-label="Siguiente"
                    className="press flex size-12 shrink-0 items-center justify-center text-ink-muted"
                    onClick={() => next && onOpenChange(next.id)}
                  >
                    <Chevron flip />
                  </button>
                </div>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
