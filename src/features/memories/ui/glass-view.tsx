"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import Link from "next/link"
import { Dialog } from "radix-ui"
import { formatMemoryDate } from "../format"
import type { MemoryView } from "../memory-view"
import { ladderOf, pickSize } from "../photo-ladder"
import type { ShareMemoryResult } from "../share/share-view"
import type { Viewport } from "./camera"
import { smoothedReader } from "./audio-level"
import { AUDIO_READINESS_COPY, useAudioReadiness } from "./audio-readiness"
import { lensGeometry, type LensGeometry } from "./glass-layout"
import { formatClock } from "./glass-mode"
import { GlassSphere } from "./glass-orb"
import type { Lens } from "./lens"
import { ShareButton } from "./share-button"
import { swipeStep } from "./swipe"
import { useAudioLevel } from "./use-audio-level"

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

/** The voice of a memory: its audio, its play control under the sphere, and the level the glass reads. */
function GlassVoice({
  memory,
  geometry,
  open,
  onLevel,
}: {
  memory: MemoryView
  geometry: LensGeometry
  open: boolean
  onLevel: (level: () => number) => void
}) {
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  const [status, setStatus] = useState<VoiceStatus>("idle")
  // How far it has played (whole seconds), shown beside the length while it plays or is paused part way.
  const [played, setPlayed] = useState(0)
  // The same listener and the same smoothing as the form's talking orb, so the voice looks alike in both places.
  const rawLevel = useAudioLevel(audio, status === "playing")
  const level = useMemo(() => smoothedReader(rawLevel), [rawLevel])
  useEffect(() => onLevel(level), [level, onLevel])
  // The voice stops when the memory does: on another memory, on close, on leaving.
  useEffect(() => {
    if (!open) audio?.pause()
  }, [open, audio])
  useEffect(() => {
    const el = audio
    return () => el?.pause()
  }, [audio])

  // The audio is made in the background after the upload: until the route answers it, the control only says so.
  const readiness = useAudioReadiness(memory.audio?.url ?? null).status
  const failed = status === "error" || readiness === "unavailable"
  const processing = readiness === "processing"
  const waiting = processing || readiness === "checking"
  const label = failed
    ? AUDIO_READINESS_COPY.unavailable
    : processing
      ? AUDIO_READINESS_COPY.processing
      : status === "playing"
        ? "Pausar audio"
        : "Reproducir audio"

  const toggle = () => {
    if (!audio) return
    if (status === "playing") audio.pause()
    else audio.play().catch(() => setStatus("error"))
  }

  const { diameter, center } = geometry
  return (
    <>
      {memory.audio && (
        <div
          data-glass-voice
          className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-3"
          style={{ left: center.x, top: center.y + diameter / 2 }}
        >
          <button
            type="button"
            disabled={failed || waiting}
            aria-pressed={failed || processing ? undefined : status === "playing"}
            aria-label={label}
            data-magnetic="light"
            data-cursor-label={status === "playing" ? "Pausar" : "Escuchar"}
            data-state={status}
            className="mem-glass-play press pointer-events-auto flex size-14 items-center justify-center rounded-full text-ink"
            style={{ "--pc": memory.orbColor } as React.CSSProperties}
            onClick={toggle}
          >
            {status === "playing" ? <PauseIcon /> : <PlayIcon />}
          </button>
          {processing ? (
            <span role="status" className="text-xs tracking-[0.08em] text-ink-muted">
              {AUDIO_READINESS_COPY.processing}
            </span>
          ) : (
            <span className="text-xs tracking-[0.08em] text-ink-muted tabular-nums">
              {played > 0 ? `${formatClock(played * 1000)} / ${formatClock(memory.audio.durationMs)}` : formatClock(memory.audio.durationMs)}
            </span>
          )}
        </div>
      )}
      {memory.audio && readiness === "ready" && (
        // Same origin now (our audio route), so `crossOrigin` is harmless; it keeps Web Audio able to read it either way.
        <audio
          ref={setAudio}
          src={memory.audio.url}
          crossOrigin="anonymous"
          preload="metadata"
          onPlay={() => setStatus("playing")}
          onPause={() => setStatus((s) => (s === "error" ? s : "idle"))}
          onTimeUpdate={(event) => setPlayed(Math.floor(event.currentTarget.currentTime))}
          onEnded={() => {
            setStatus("idle")
            setPlayed(0)
          }}
          onError={() => setStatus("error")}
        />
      )}
    </>
  )
}

/**
 * The caption, date and place floating by the sphere, between the previous and next controls. On a switch the text
 * lets go first and the next one comes in with a short stagger once the camera is half way across.
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
}: Pick<GlassViewProps, "prev" | "next" | "onStep"> & {
  memory: MemoryView
  hasVoice: boolean
  geometry: LensGeometry
  leaving: boolean
  entering: boolean
  /** A guest has nothing to step to: the caption stands alone. */
  stepless: boolean
}) {
  const { diameter, center, caption: captionAt } = geometry
  const side = captionAt === "side"
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
  const pending = memory.status === "pending"

  return (
    <>
      <div
        data-glass-caption
        data-caption={captionAt}
        data-leaving={leaving || undefined}
        data-entering={entering || undefined}
        aria-live="polite"
        className={
          side
            ? "pointer-events-none absolute flex -translate-y-1/2 flex-col items-start gap-3"
            : `pointer-events-none absolute left-1/2 flex w-full max-w-[640px] -translate-x-1/2 items-center gap-3 px-3 ${stepless ? "justify-center" : "justify-between"}`
        }
        style={
          side
            ? {
                top: center.y,
                left: Math.round(center.x + diameter / 2 + 24),
                right: "max(1.5rem, calc(env(safe-area-inset-right) + 0.5rem))",
              }
            : { top: Math.round(center.y + diameter / 2 + (hasVoice ? 64 : 40)) }
        }
      >
        {!side && !stepless && prevButton}
        <div key={memory.id} className={side ? "mem-caption-text min-w-0 text-left" : "mem-caption-text min-w-0 text-center"}>
          <Dialog.Title className="t-title m-0 text-[length:var(--type-3)] text-ink">{memory.caption}</Dialog.Title>
          <p id="memory-glass-date" className="m-0 mt-1.5 text-xs tracking-[0.08em] text-ink-muted">
            {formatMemoryDate(memory.happenedOn)}
          </p>
          {memory.place?.name && <p className="m-0 mt-0.5 text-[11px] tracking-[0.06em] text-ink-faint">{memory.place.name}</p>}
          {pending && <p className="m-0 mt-1 text-xs tracking-[0.08em] text-ink-muted">Pendiente de aprobación</p>}
        </div>
        {!side && !stepless && nextButton}
        {side && !stepless && (
          <div className="flex items-center gap-2">
            {prevButton}
            {nextButton}
          </div>
        )}
      </div>
    </>
  )
}

/** What a guest has instead of the journey's way back: "Universo" on top, and a quiet way in below. Both go to the start. */
function GuestExits({ onExit }: { onExit: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onExit}
        data-magnetic="light"
        data-cursor-label="Volver al universo"
        className="press pointer-events-auto absolute top-[max(1.75rem,calc(env(safe-area-inset-top)+0.5rem))] left-[max(1.25rem,calc(env(safe-area-inset-left)+0.25rem))] flex h-12 items-center gap-3 px-3 text-xs tracking-[0.08em] text-ink-muted md:left-[max(2.25rem,calc(env(safe-area-inset-left)+0.5rem))]"
      >
        <Chevron />
        <span>Universo</span>
      </button>
      <Link
        href="/"
        data-magnetic="light"
        data-cursor-label="Entrar"
        className="press pointer-events-auto absolute bottom-[max(1.5rem,calc(env(safe-area-inset-bottom)+0.75rem))] left-1/2 flex h-12 -translate-x-1/2 items-center px-4 whitespace-nowrap text-xs tracking-[0.08em] text-ink-faint"
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
}: GlassViewProps) {
  const guest = guestExit !== undefined
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
    if (guest) return
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
              <div className="pointer-events-none absolute top-[max(1.25rem,calc(env(safe-area-inset-top)+0.25rem))] right-[max(1.25rem,calc(env(safe-area-inset-right)+0.25rem))] flex items-center">
                {share && <ShareButton memory={shown} share={share} />}
                <Dialog.Close
                  data-magnetic="light"
                  data-cursor-label="Cerrar"
                  className="press pointer-events-auto flex h-12 items-center px-3 text-xs tracking-[0.08em] text-ink-muted"
                >
                  Cerrar
                </Dialog.Close>
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
              <GlassVoice key={shown.id} memory={shown} open={memory !== null} geometry={geometry} onLevel={onLevel} />
              {guestExit && <GuestExits onExit={guestExit} />}
              <GlassCaption
                memory={caption ?? shown}
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
