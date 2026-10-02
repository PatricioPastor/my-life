"use client"

import { useRef, useState, type CSSProperties } from "react"
import { formatClock } from "./glass-mode"
import { fillPercent, scrubText, seekTarget } from "./player-model"

interface AudioScrubberProps {
  /** How far the voice has played, in whole seconds. */
  elapsed: number
  /** How long the voice is, in seconds. */
  total: number
  disabled: boolean
  /** Asked to move the voice to a time (seconds). */
  onSeek: (seconds: number) => void
}

type RangeStyle = CSSProperties & { "--fill": string }

/**
 * The seekable progress of the voice: the time played, a slider, and the length. It is a native range input, so the
 * pointer, touch, the arrow keys, Page Up/Down, Home and End all work, and a screen reader reads "3:12 de 15:32".
 * A drag shows where it will land but only seeks when released (a long voice would otherwise ask the server for a new
 * range on every move); a key press seeks at once.
 */
export function AudioScrubber({ elapsed, total, disabled, onSeek }: AudioScrubberProps) {
  // Where a drag is, while the pointer is down; the voice keeps playing from its own clock until it is released.
  const [draft, setDraft] = useState<number | null>(null)
  const dragging = useRef(false)
  // The last value the drag reached (null until the value actually moves): a press that only grabs the thumb has nothing to seek to.
  const dragged = useRef<number | null>(null)

  const max = Math.max(Math.round(total), 1)
  const shown = Math.min(draft ?? elapsed, max)

  // Ends the drag, once however many events say so. A drag that moved seeks (a click on the track is a drag that jumped
  // there); a press that did not move, or one the browser cancelled, seeks nowhere.
  const end = (commit: boolean) => {
    if (!dragging.current) return
    const value = dragged.current
    dragging.current = false
    dragged.current = null
    setDraft(null)
    if (commit && value !== null) onSeek(seekTarget(value, total))
  }

  return (
    <>
      <span className="w-10 shrink-0 text-right text-xs tracking-[0.04em] text-ink-muted tabular-nums">{formatClock(shown * 1000)}</span>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={shown}
        disabled={disabled}
        aria-label="Progreso del audio"
        aria-valuetext={scrubText(shown, total)}
        data-glass-progress
        className="mem-range min-w-0 flex-1"
        style={{ "--fill": `${fillPercent(shown, max)}%` } as RangeStyle}
        onChange={(event) => {
          const value = Number(event.currentTarget.value)
          if (dragging.current) {
            dragged.current = value
            setDraft(value)
          } else onSeek(seekTarget(value, total))
        }}
        onPointerDown={(event) => {
          dragging.current = true
          dragged.current = null
          // Hold the pointer, so letting go outside the track still reaches this slider and ends the drag.
          try {
            event.currentTarget.setPointerCapture?.(event.pointerId)
          } catch {
            // The pointer is already gone: its up event will not come, and lostpointercapture ends the drag.
          }
        }}
        onPointerUp={() => end(true)}
        onPointerCancel={() => end(false)}
        onLostPointerCapture={() => end(true)}
        onBlur={() => end(true)}
      />
      <span className="w-10 shrink-0 text-xs tracking-[0.04em] text-ink-muted tabular-nums">{formatClock(total * 1000)}</span>
    </>
  )
}
