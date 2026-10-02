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

  const max = Math.max(Math.round(total), 1)
  const shown = Math.min(draft ?? elapsed, max)

  const release = (value: number) => {
    if (!dragging.current) return
    dragging.current = false
    setDraft(null)
    onSeek(seekTarget(value, total))
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
          if (dragging.current) setDraft(value)
          else onSeek(seekTarget(value, total))
        }}
        onPointerDown={() => {
          dragging.current = true
        }}
        onPointerUp={(event) => release(Number(event.currentTarget.value))}
        onPointerCancel={(event) => release(Number(event.currentTarget.value))}
        onBlur={(event) => release(Number(event.currentTarget.value))}
      />
      <span className="w-10 shrink-0 text-xs tracking-[0.04em] text-ink-muted tabular-nums">{formatClock(total * 1000)}</span>
    </>
  )
}
