"use client"

import { useRef, type CSSProperties, type KeyboardEvent } from "react"
import { cn } from "@/shared/lib/utils"
import { DEFAULT_ORB_COLOR, rimColor, swatchNames } from "../orb-color"

/** The picker's Spanish copy (neutral, `tú`). */
export const ORB_COLOR_COPY = {
  label: "Color de tu orbe",
  idle: "Elige una foto o un audio para ver los colores de tu orbe.",
  reading: "Buscando los colores de tu foto…",
  fromPhoto: "Los primeros colores salen de tu foto.",
  voice: "Sin foto, tu orbe toma uno de estos colores.",
  fallback: "No pudimos leer los colores de esta foto. Elige uno de estos.",
} as const

export interface OrbColorPickerProps {
  /** Where the swatches are: not asked for yet, being extracted, or ready. */
  status: "idle" | "reading" | "ready"
  /** Glowing `#rrggbb` swatches: the photo's own tones (dominant first), then the curated hues (see `orbSwatches`). */
  colors: readonly string[]
  /** The chosen swatch, or null before there is one. */
  value: string | null
  /** False when the photo could not be read and the curated hues alone stand in. */
  fromPhoto: boolean
  /** True for a memory with no photo (only an audio): the curated hues are the offer, and it says so. */
  voice?: boolean
  disabled: boolean
  onChange: (hex: string) => void
}

type OrbStyle = CSSProperties & Record<`--${string}`, string>

const NOTE_ID = "memory-orb-note"
const LABEL_ID = "memory-orb-label"
const SLOTS = 6
/** Six 44 px cells to a row: the photo's tones fill the first, the twelve curated hues the next two. */
const ROW = "grid grid-cols-[repeat(6,2.75rem)] gap-0.5"

function noteFor({ status, fromPhoto, voice }: Pick<OrbColorPickerProps, "status" | "fromPhoto" | "voice">): string {
  if (status === "idle") return ORB_COLOR_COPY.idle
  if (status === "reading") return ORB_COLOR_COPY.reading
  if (voice) return ORB_COLOR_COPY.voice
  return fromPhoto ? ORB_COLOR_COPY.fromPhoto : ORB_COLOR_COPY.fallback
}

/** A small orb that glows in the chosen color, drawn like the ones in the memories space. */
function OrbPreview({ color }: { color: string }) {
  const style: OrbStyle = { "--pc": color, "--rim": rimColor(color), "--size": "30px", "--soft": "0.5" }
  return (
    <div
      data-testid="orb-preview"
      aria-hidden="true"
      className="grid size-16 shrink-0 place-items-center rounded-md border border-[#a8c8ff]/15 bg-[#040309]"
    >
      <span className="mem-dot" style={style} />
    </div>
  )
}

/**
 * "Color de tu orbe": the photo's own tones, then the twelve curated hues (only those for a memory with just a voice),
 * as a radiogroup of round buttons in rows of six, and a live preview of the orb in the chosen color. Arrow keys move
 * the selection (and the focus) the way native radios do; only the selected swatch is a tab stop. The swatch row and
 * the preview keep their space before there is a photo, so the dialog does not jump when the colors arrive.
 */
export function OrbColorPicker({ status, colors, value, fromPhoto, voice, disabled, onChange }: OrbColorPickerProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const names = swatchNames(colors)
  const selected = value ? colors.indexOf(value) : -1
  const tabStop = selected >= 0 ? selected : 0

  function move(to: number) {
    const next = (to + colors.length) % colors.length
    onChange(colors[next])
    refs.current[next]?.focus()
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    if (disabled) return
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault()
        return move(index + 1)
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault()
        return move(index - 1)
      case "Home":
        event.preventDefault()
        return move(0)
      case "End":
        event.preventDefault()
        return move(colors.length - 1)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={LABEL_ID} className="t-label text-ink-muted">
        {ORB_COLOR_COPY.label}
      </span>
      {/* The preview wraps under the swatches on a phone too narrow for both, never squeezing a 44 px cell. */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          data-testid="orb-swatches"
          role={colors.length > 0 ? "radiogroup" : undefined}
          aria-labelledby={colors.length > 0 ? LABEL_ID : undefined}
          aria-describedby={colors.length > 0 ? NOTE_ID : undefined}
          className={cn(ROW, "min-h-16 grow content-center items-center")}
        >
          {colors.length > 0 ? (
            <>
              {colors.map((color, index) => (
                <button
                  key={color}
                  ref={(node) => {
                    refs.current[index] = node
                  }}
                  type="button"
                  role="radio"
                  aria-checked={index === selected}
                  aria-label={names[index]}
                  data-color={color}
                  tabIndex={index === tabStop ? 0 : -1}
                  disabled={disabled}
                  onClick={() => onChange(color)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  data-magnetic="light"
                  data-cursor-label={names[index]}
                  className="press grid size-11 shrink-0 place-items-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#a8c8ff] disabled:opacity-60"
                >
                  <span
                    data-swatch
                    className={cn(
                      "size-6 rounded-full transition-[box-shadow,transform] duration-200",
                      index === selected && "scale-110 ring-2 ring-[#eaf0ff] ring-offset-2 ring-offset-[#0b0a1c]",
                    )}
                    style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}66` }}
                  />
                </button>
              ))}
            </>
          ) : (
            // Keeps the row's height (and shows where the colors will be) until there is a photo to take them from.
            <div aria-hidden="true" className={cn(ROW, "col-span-full")}>
              {Array.from({ length: SLOTS }, (_, index) => (
                <span key={index} className="grid size-11 place-items-center">
                  <span className="size-6 rounded-full border border-dashed border-[#a8c8ff]/20" />
                </span>
              ))}
            </div>
          )}
        </div>
        <OrbPreview color={value ?? DEFAULT_ORB_COLOR} />
      </div>
      <p id={NOTE_ID} aria-live="polite" className="m-0 min-h-4 text-xs tracking-[0.04em] text-ink-muted">
        {noteFor({ status, fromPhoto, voice })}
      </p>
    </div>
  )
}
