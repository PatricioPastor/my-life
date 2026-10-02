"use client"

import { cn } from "@/shared/lib/utils"
import { RELATED_COPY } from "./related-memory"

interface SamePlaceOptionProps {
  /** The place of the memory this one is contributed from, as one line. The position itself is never here. */
  place: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled: boolean
}

/**
 * "Mismo lugar": an opt-in to keep the same place as the memory this one is contributed from. It shows that place by
 * name and address; the server copies the place columns itself, so no position is sent from here.
 */
export function SamePlaceOption({ place, checked, onChange, disabled }: SamePlaceOptionProps) {
  return (
    <label
      htmlFor="memory-same-place"
      className={cn("flex cursor-pointer items-start gap-3 text-ink", disabled && "cursor-default")}
    >
      <input
        id="memory-same-place"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        aria-describedby="memory-same-place-line"
        data-magnetic="light"
        data-cursor-label="Mismo lugar"
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[#a8c8ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8c8ff]"
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="t-body text-[length:var(--type-1)]">{RELATED_COPY.sameLabel}</span>
        <span id="memory-same-place-line" className="text-xs tracking-[0.04em] text-ink-muted [overflow-wrap:anywhere]">
          {place}
        </span>
      </span>
    </label>
  )
}
