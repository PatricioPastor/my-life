"use client"

import { useRef, type CSSProperties, type KeyboardEvent } from "react"
import { cn } from "@/shared/lib/utils"
import { DEFAULT_ORB_COLOR, rimColor, swatchNames } from "../orb-color"
import { ORB_HUES } from "../orb-hues"
import { HINT } from "./sheet-styles"

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
const SLOTS = 12
/** Six 44 px cells to a row (274 px, so it fits a 320 px phone): the photo's tones first, then the twelve curated hues. */
const ROW = "grid grid-cols-[repeat(6,2.75rem)] gap-0.5"

/**
 * What the note under the swatches says. "The first colors come from your photo" only when one of them really does: a
 * photo whose every tone was folded into a curated hue offers the curated hues alone, and then the note says nothing.
 */
function noteFor({ status, colors, fromPhoto, voice }: Pick<OrbColorPickerProps, "status" | "colors" | "fromPhoto" | "voice">): string {
  if (status === "idle") return ORB_COLOR_COPY.idle
  if (status === "reading") return ORB_COLOR_COPY.reading
  if (voice) return ORB_COLOR_COPY.voice
  if (!fromPhoto) return ORB_COLOR_COPY.fallback
  return colors.some((color) => !ORB_HUES.includes(color)) ? ORB_COLOR_COPY.fromPhoto : ""
}

/** The orb in the chosen color, large, drawn like the ones in the memories space; its glow fills the 120 px stage. */
function OrbPreview({ color }: { color: string }) {
  const style: OrbStyle = { "--pc": color, "--rim": rimColor(color), "--size": "48px", "--soft": "0.5" }
  return (
    <div data-testid="orb-preview" aria-hidden="true" className="grid size-30 shrink-0 place-items-center">
      <span className="mem-dot" style={style} />
    </div>
  )
}

/**
 * "Color de tu orbe" (named for screen readers; the step's own heading says it on screen): a large preview of the orb
 * in the chosen color, then the photo's own tones and the twelve curated hues (only those for a memory with just a
 * voice) as a radiogroup of round buttons in rows of six. Arrow keys move the selection (and the focus) the way native
 * radios do; only the selected swatch is a tab stop. The swatch rows keep their space while the photo is still being
 * read, so nothing jumps when the colors arrive.
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
    <div className="flex flex-col items-center gap-4">
      <span id={LABEL_ID} className="sr-only">
        {ORB_COLOR_COPY.label}
      </span>
      <OrbPreview color={value ?? DEFAULT_ORB_COLOR} />
      <div
        data-testid="orb-swatches"
        role={colors.length > 0 ? "radiogroup" : undefined}
        aria-labelledby={colors.length > 0 ? LABEL_ID : undefined}
        aria-describedby={colors.length > 0 ? NOTE_ID : undefined}
        className={cn(ROW, "min-h-11 content-start justify-center")}
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
                {/* The glow is the swatch's own shadow; the chosen one is marked by an outline, which the shadow cannot hide. */}
                <span
                  data-swatch
                  className={cn(
                    "size-6 rounded-full outline-2 outline-offset-2 outline-transparent transition-[scale,outline-color] duration-200 ease-out",
                    index === selected && "scale-110 outline-[#eaf0ff]",
                  )}
                  style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}66` }}
                />
              </button>
            ))}
          </>
        ) : (
          // Two rows of empty cells while the photo is read: the twelve curated hues always come, so nothing jumps.
          <div aria-hidden="true" className={cn(ROW, "col-span-full")}>
            {Array.from({ length: SLOTS }, (_, index) => (
              <span key={index} className="grid size-11 place-items-center">
                <span className="size-6 rounded-full bg-white/[0.06]" />
              </span>
            ))}
          </div>
        )}
      </div>
      <p id={NOTE_ID} data-testid="orb-note" aria-live="polite" className={cn(HINT, "min-h-5 text-center")}>
        {noteFor({ status, colors, fromPhoto, voice })}
      </p>
    </div>
  )
}
