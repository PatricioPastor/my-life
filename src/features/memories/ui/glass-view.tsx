"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import Link from "next/link"
import { Dialog } from "radix-ui"
import { BAR_LEFT, BAR_RIGHT, BAR_TOP } from "@/shared/lib/top-bar"
import { formatMemoryDate } from "../format"
import type { MemoryView } from "../memory-view"
import { ladderOf, pickSize } from "../photo-ladder"
import type { ShareMemoryResult } from "../share/share-view"
import type { RecordViewResult } from "../views/view-result"
import type { Viewport } from "./camera"
import { captionTier, type CaptionTier } from "./caption-text"
import { lensGeometry, type LensGeometry } from "./glass-layout"
import { GlassSphere } from "./glass-orb"
import { GlassVoice } from "./glass-voice"
import { ParticleCanvas } from "./particle-canvas"
import type { Lens } from "./lens"
import { createShareCache } from "./share-cache"
import { ShareButton } from "./share-button"
import { isTypingTarget } from "./player-model"
import { swipeStep } from "./swipe"
import { formatViewCount } from "./view-count"
import { createViewRecorder } from "./view-recorder"

interface GlassViewProps {
  /** The memory the glass is open on, or null when closed. */
  memory: MemoryView | null
  prev: MemoryView | null
  next: MemoryView | null
  /** The element the dialog mounts into, so it stays inside the stage (and its cursor). */
  container: HTMLElement | null
  reduced: boolean
  /** The viewport, and its device pixel ratio (the sphere is laid out on whole device pixels). */
  viewport: Viewport & { dpr?: number }
  /** Another memory to fly to (the arrows, the buttons, a swipe). */
  onStep: (id: string) => void
  onClose: () => void
  /** Called once the dialog has closed, to put focus back on the orb that was opened. */
  onRestoreFocus: (id: string) => void
  /** Warms a memory's photo (the neighbours, while this one is open), so a step lands on a sharp photo. */
  onWarm?: (memory: MemoryView) => void
  /** The persistent WebGL lens, or null (the CSS glass stands in). */
  lens?: Lens | null
  /** How far the camera has carried the world on a switch (0..1), or null when it is not moving. */
  travel?: () => number | null
  /** The camera is carrying the world to another memory: the caption waits for it to be half way. */
  switching?: boolean
  /**
   * Set when a guest holds a share link: the glass is the whole page. There is no previous or next, no swipe, and no
   * way to leave by zooming out; instead it offers "Universo" (this function) and a quiet "Entrar al universo" link,
   * both to the start. Esc and Cerrar still go through `onClose`.
   */
  guestExit?: () => void
  /** Asks for the link to share a memory (a server action, or the link a guest already holds). Absent: no share control. */
  share?: (id: string) => Promise<ShareMemoryResult>
  /**
   * Tells the server the visitor opened a memory (a server action), for the distinct-viewers count. Called once per
   * approved memory per page session, when the glass has landed on it: never for a neighbour it only warms, never for a
   * pending memory, never while the camera is still travelling, and never for a guest. Absent: nothing is recorded.
   */
  onView?: (id: string) => Promise<RecordViewResult>
}

/** The caption changes once the camera is this far across a switch (or at once when there is no travel). */
const CAPTION_SWAP_AT = 0.45

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

/** The title's size for each tier (see `captionTier`): the longer the caption, the smaller, so it stays a few calm lines. */
const TITLE_SIZE: Record<CaptionTier, string> = {
  lg: "text-[length:var(--type-3)]",
  md: "text-[length:var(--type-2)]",
  sm: "text-[length:var(--type-1)]",
}

/** The sphere's gap above the caption when there is no player between them. */
const CAPTION_GAP = 16
/** Between the player and the caption. */
const PLAYER_TO_CAPTION = 4

/**
 * The caption, date and place under the sphere, with the controls to move between memories in a row of their own (so
 * they never squeeze the text). The block is bounded: it starts under the sphere (and its player) and ends above the
 * bottom of the screen, so it cannot run off it. The title steps down in size for a long caption and is cut to a few
 * lines, with "Ver más" to open all of it in a panel that scrolls. On a switch the text lets go first and the next one
 * comes in with a short stagger once the camera is half way across.
 */
function GlassCaption({
  memory,
  hasVoice,
  prev,
  next,
  geometry,
  leaving,
  entering,
  onStep,
  stepless,
  newViewers,
}: Pick<GlassViewProps, "prev" | "next" | "onStep"> & {
  memory: MemoryView
  /** Memories this visitor just became a viewer of: the count the server sent does not include them yet. */
  newViewers: ReadonlySet<string>
  hasVoice: boolean
  geometry: LensGeometry
  leaving: boolean
  entering: boolean
  /** A guest has nothing to step to: the caption stands alone. */
  stepless: boolean
}) {
  const { diameter, center, caption: captionAt, player } = geometry
  const side = captionAt === "side"
  const tier = captionTier(memory.caption)
  // Which memory the caption is open (or found cut) for: another memory starts collapsed, with no effect to reset it.
  const [expandedFor, setExpandedFor] = useState<string | null>(null)
  const [clippedFor, setClippedFor] = useState<string | null>(null)
  const expanded = expandedFor === memory.id
  const clipped = clippedFor === memory.id
  const title = useRef<HTMLHeadingElement>(null)

  // Whether the title is cut by its line clamp. Only measured while collapsed (open, it has no clamp to measure), and
  // again whenever its box changes (a rotation, a resize, the font arriving).
  useLayoutEffect(() => {
    const el = title.current
    if (!el || expandedFor === memory.id) return
    const measure = () => {
      const cut = el.scrollHeight > el.clientHeight + 1
      setClippedFor((now) => (cut ? memory.id : now === memory.id ? null : now))
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [memory.id, memory.caption, expandedFor])

  const prevButton = (
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
  )
  const nextButton = (
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
  )
  const more =
    clipped || expanded ? (
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={TEXT_ID}
        data-magnetic="light"
        data-cursor-label={expanded ? "Ver menos" : "Ver más"}
        className="press pointer-events-auto flex h-11 shrink-0 items-center px-4 text-xs tracking-[0.08em] text-ink-muted"
        onClick={() => setExpandedFor(expanded ? null : memory.id)}
      >
        {expanded ? "Ver menos" : "Ver más"}
      </button>
    ) : null
  const pending = memory.status === "pending"
  const views = formatViewCount(memory.viewCount + (newViewers.has(memory.id) ? 1 : 0))
  const align = side ? "text-left" : "text-center"

  return (
    <div
      data-glass-caption
      data-caption={captionAt}
      data-leaving={leaving || undefined}
      data-entering={entering || undefined}
      aria-live="polite"
      className={
        side
          ? "pointer-events-none absolute flex max-h-[calc(100%-7rem)] -translate-y-1/2 flex-col items-start gap-1"
          : `pointer-events-none absolute left-1/2 flex w-full max-w-[640px] -translate-x-1/2 flex-col px-4 ${
              stepless
                ? // The guest's way in sits at the bottom edge: the text stops above it.
                  "bottom-[max(5rem,calc(env(safe-area-inset-bottom)+4.5rem))]"
                : "bottom-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.5rem))]"
            }`
      }
      style={
        side
          ? {
              top: center.y,
              left: Math.round(center.x + diameter / 2 + 24),
              right: "max(1.5rem, calc(env(safe-area-inset-right) + 0.5rem))",
            }
          : { top: Math.round(center.y + diameter / 2 + (hasVoice ? player + PLAYER_TO_CAPTION : CAPTION_GAP)) }
      }
    >
      <div
        data-glass-panel
        data-expanded={expanded || undefined}
        // A drag on the text that is open scrolls it; the swipe only turns the page on a mostly horizontal one.
        className={`min-h-0 w-full touch-pan-y overflow-y-auto overscroll-contain ${expanded ? "pointer-events-auto" : ""}`}
        onPointerDown={expanded ? (event) => event.stopPropagation() : undefined}
      >
        <div key={memory.id} id={TEXT_ID} data-glass-text className={`mem-caption-text min-w-0 ${align}`}>
          <Dialog.Title
            ref={title}
            data-size={tier}
            className={`t-title m-0 text-ink leading-[1.25] text-balance ${TITLE_SIZE[tier]} ${expanded ? "" : "line-clamp-3"}`}
          >
            {memory.caption}
          </Dialog.Title>
          <p id="memory-glass-date" className="m-0 mt-1.5 text-xs tracking-[0.08em] text-ink-muted">
            {formatMemoryDate(memory.happenedOn)}
          </p>
          {memory.place?.name && <p className="m-0 mt-0.5 text-xs tracking-[0.06em] text-ink-muted">{memory.place.name}</p>}
          {/* Plain, quiet text: not a control, and `aria-live="off"` so the count catching up after an open is not announced. */}
          {views && (
            <p data-glass-views aria-live="off" className="m-0 mt-0.5 text-xs tracking-[0.06em] text-ink-muted tabular-nums">
              {views}
            </p>
          )}
          {pending && <p className="m-0 mt-1 text-xs tracking-[0.08em] text-ink-muted">Pendiente de aprobación</p>}
        </div>
      </div>
      {!stepless ? (
        <div data-glass-nav className={`flex shrink-0 items-center ${side ? "gap-2" : "h-12 justify-between"}`}>
          {prevButton}
          {more}
          {nextButton}
        </div>
      ) : (
        more && <div className="flex shrink-0 justify-center">{more}</div>
      )}
    </div>
  )
}

const TEXT_ID = "memory-glass-text"

/** What a guest has instead of the journey's way back: "Universo" on top, and a quiet way in below. Both go to the start. */
function GuestExits({ onExit }: { onExit: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onExit}
        data-magnetic="light"
        data-cursor-label="Volver al universo"
        className={`press pointer-events-auto absolute ${BAR_TOP} ${BAR_LEFT} flex h-12 items-center gap-3 px-3 text-xs tracking-[0.08em] text-ink-muted`}
      >
        <Chevron />
        <span>Universo</span>
      </button>
      <Link
        href="/"
        data-magnetic="light"
        data-cursor-label="Entrar"
        className="press pointer-events-auto absolute bottom-[max(1.5rem,calc(env(safe-area-inset-bottom)+0.75rem))] left-1/2 flex h-12 -translate-x-1/2 items-center px-4 whitespace-nowrap text-xs tracking-[0.08em] text-ink-muted"
      >
        Entrar al universo
      </Link>
    </>
  )
}

const silence = () => 0

/**
 * The glass view: a memory held in a glass sphere that the camera has flown up to, with its caption, date and place
 * floating below. A dialog (Esc, the close button, zooming out, a click on the empty stage all close it; the arrows,
 * the buttons and a swipe fly to the neighbours) so focus is managed and the rest of the stage is hidden from the
 * cursor and from assistive technology. The sphere opens exactly over the disc the orb grew into and condenses into
 * glass; on close it melts back into the orb while the rest fades, and only then does the dialog let go.
 */
export function GlassView({
  memory,
  prev,
  next,
  container,
  reduced,
  viewport,
  onStep,
  onClose,
  onRestoreFocus,
  onWarm,
  lens = null,
  travel,
  switching = false,
  guestExit,
  share,
  onView,
}: GlassViewProps) {
  const guest = guestExit !== undefined
  // The share links asked for so far, for the whole session: each memory's link is asked for once, when it opens.
  // The share function is taken once: it is a server action, or a link the page holds, and does not change.
  const [shareLinks] = useState(() =>
    createShareCache((id) => (share ? share(id) : Promise.resolve({ ok: false, reason: "unavailable" }))),
  )

  // Opens are told to the server once per memory for the whole session. The function is taken once, like `share`: it is a
  // server action and does not change. A guest has no session to count, so nothing is recorded for them.
  const [viewRecorder] = useState(() =>
    createViewRecorder((id) => (onView ? onView(id) : Promise.resolve<RecordViewResult>({ ok: false, reason: "unavailable" }))),
  )
  // Memories this visitor has just become a viewer of: the count on screen goes up by one for each, ahead of the next load.
  const [newViewers, setNewViewers] = useState<ReadonlySet<string>>(() => new Set())
  // An open is the glass landed on an approved memory: not a neighbour it only warms, not a memory the camera is still
  // carrying the world to (rapid stepping passes through several), and not a pending one.
  const openedId = memory && !switching && memory.status === "approved" ? memory.id : null
  const recording = onView !== undefined && !guest
  useEffect(() => {
    if (!openedId || !recording) return
    void viewRecorder.record(openedId).then((counted) => {
      if (counted) setNewViewers((ids) => new Set(ids).add(openedId))
    })
  }, [openedId, recording, viewRecorder])

  // The last memory stays on screen while the dialog fades out (and tells where focus goes back to).
  const [held, setHeld] = useState<MemoryView | null>(memory)
  if (memory && memory !== held) setHeld(memory)
  const shown = memory ?? held
  const geometry = lensGeometry(viewport, viewport.dpr ?? 1)
  // The same square crop the orb showed, at the size the sphere needs on this screen.
  const photoUrl = shown ? (pickSize(ladderOf(shown), geometry.diameter, geometry.dpr)?.url ?? null) : null

  // The voice of the memory on screen, read by the sphere every frame.
  const levelRef = useRef<() => number>(silence)
  const level = useCallback(() => levelRef.current(), [])
  const onLevel = useCallback((reader: () => number) => {
    levelRef.current = reader
  }, [])
  // Whether that voice is playing: the orb only throws particles off while it is.
  const [speaking, setSpeaking] = useState(false)

  // The caption on screen. On a switch it lets go at once and changes once the camera is half way across.
  const [caption, setCaption] = useState<MemoryView | null>(memory)
  // Opening, or a switch that is over (landed, or a cut): the caption is the memory at once.
  if (memory && (!caption || (!switching && memory.id !== caption.id))) setCaption(memory)
  const [entering, setEntering] = useState(false)
  const swapTo = useRef<MemoryView | null>(null)
  useEffect(() => {
    swapTo.current = memory && caption && memory.id !== caption.id ? memory : null
  }, [memory, caption])
  const onTravel = useCallback((moved: number | null) => {
    const target = swapTo.current
    if (!target || (moved !== null && moved < CAPTION_SWAP_AT)) return
    swapTo.current = null
    setCaption(target)
    setEntering(true)
  }, [])
  const leaving = memory !== null && caption !== null && memory.id !== caption.id

  // The memories on either side are a step away: their photos are fetched and decoded now.
  useEffect(() => {
    if (!memory || !onWarm || guest) return
    if (prev) onWarm(prev)
    if (next) onWarm(next)
  }, [memory, prev, next, onWarm, guest])

  // A swipe anywhere on the glass turns the page (the sphere, the caption or the empty stage); the camera cannot pan
  // while it is open, so the two never compete.
  const swipeFrom = useRef<{ x: number; y: number } | null>(null)
  const swipe = {
    onPointerDown: (event: PointerEvent) => {
      swipeFrom.current = { x: event.clientX, y: event.clientY }
    },
    onPointerUp: (event: PointerEvent) => {
      const start = swipeFrom.current
      swipeFrom.current = null
      if (!start || !memory) return
      const step = swipeStep(event.clientX - start.x, event.clientY - start.y)
      const target = step === 1 ? next : step === -1 ? prev : null
      if (target) onStep(target.id)
    },
    onPointerCancel: () => {
      swipeFrom.current = null
    },
  }

  const onKeyDown = (event: KeyboardEvent) => {
    // A slider (the scrubber, the volume) owns its arrows.
    if (guest || isTypingTarget(event.target)) return
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
    // A guest has no overview to zoom back to: only the exits leave.
    if (event.deltaY > 0 && !guest) onClose()
  }

  return (
    <Dialog.Root open={memory !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal container={container}>
        {/* Above the journey's HUD (the way back), which is drawn after the stage: a dialog covers it like the rest. */}
        <Dialog.Overlay className="mem-scrim absolute inset-0 z-10 bg-[#020207]/70" onWheel={onWheel} {...(guest ? {} : swipe)} />
        <Dialog.Content
          aria-describedby="memory-glass-date"
          className="mem-glass absolute inset-0 z-10 outline-none"
          // Only the sphere and the controls take pointers: a press on the empty stage falls through to the scrim and closes.
          style={{ pointerEvents: "none" }}
          onKeyDown={onKeyDown}
          onWheel={onWheel}
          {...(guest ? {} : swipe)}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            // By now the dialog has closed and `memory` is null, so use the last memory that was on screen.
            if (held) onRestoreFocus(held.id)
          }}
        >
          {shown && (
            <>
              {/* Cerrar comes first in the DOM, so it keeps the dialog's initial focus; the row is reversed to show Compartir before it. */}
              <div className={`pointer-events-none absolute ${BAR_TOP} ${BAR_RIGHT} flex flex-row-reverse items-center`}>
                <Dialog.Close
                  data-magnetic="light"
                  data-cursor-label="Cerrar"
                  className="press pointer-events-auto flex h-12 items-center px-3 text-xs tracking-[0.08em] text-ink-muted"
                >
                  Cerrar
                </Dialog.Close>
                {share && <ShareButton memory={shown} share={share} cache={shareLinks} />}
              </div>
              <GlassSphere
                memory={shown}
                photoUrl={photoUrl}
                open={memory !== null}
                lens={lens}
                geometry={geometry}
                reduced={reduced}
                level={level}
                travel={travel}
                onTravel={onTravel}
              />
              {shown.audio && (
                <ParticleCanvas
                  geometry={geometry}
                  color={shown.orbColor}
                  level={level}
                  emitting={speaking}
                  active={memory !== null}
                  reduced={reduced}
                />
              )}
              <GlassVoice
                key={shown.id}
                memory={shown}
                open={memory !== null}
                geometry={geometry}
                reduced={reduced}
                onLevel={onLevel}
                onPlaying={setSpeaking}
              />
              {guestExit && <GuestExits onExit={guestExit} />}
              <GlassCaption
                memory={caption ?? shown}
                newViewers={newViewers}
                stepless={guest}
                hasVoice={shown.audio !== null}
                leaving={leaving}
                entering={entering && !leaving}
                prev={memory ? prev : null}
                next={memory ? next : null}
                geometry={geometry}
                onStep={onStep}
              />
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
