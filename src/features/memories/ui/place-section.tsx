"use client"

import { cn } from "@/shared/lib/utils"
import { coordinatesLabel, googleMapsUrl, PLACE_COPY, suggestionLabel } from "./place-model"
import type { PhotoPlace } from "./use-photo-place"

const LABEL_CLASS = "t-label text-ink-muted"

interface PlaceSectionProps {
  place: PhotoPlace
  /** The visitor's consent to keep the (approximate) place. */
  consent: boolean
  onConsentChange: (next: boolean) => void
  disabled: boolean
}

function statusText(place: PhotoPlace): string {
  switch (place.status) {
    case "idle":
      return PLACE_COPY.idle
    case "reading":
      return PLACE_COPY.reading
    case "none":
      return PLACE_COPY.noGps
    case "found":
      if (place.naming) return PLACE_COPY.naming
      return place.label ? suggestionLabel(place.label) : coordinatesLabel(place.lat, place.lng)
  }
}

/**
 * "¿Dónde se sacó?": where the PHOTO was taken, suggested from its own GPS (never the visitor's location). The
 * visitor can check the spot on the map and decides whether to keep an approximate version of it.
 */
export function PlaceSection({ place, consent, onConsentChange, disabled }: PlaceSectionProps) {
  const found = place.status === "found" ? place : null

  return (
    <div role="group" aria-labelledby="memory-place-label" className="flex flex-col gap-2">
      <span id="memory-place-label" className={LABEL_CLASS}>
        {PLACE_COPY.heading}
      </span>
      <p id="memory-place-status" aria-live="polite" className="t-body m-0 text-[length:var(--type-1)] text-ink">
        {statusText(place)}
      </p>
      {found && (
        <a
          href={googleMapsUrl(found.lat, found.lng)}
          target="_blank"
          rel="noopener noreferrer"
          data-magnetic="light"
          data-cursor-label="Abrir mapa"
          className="w-fit text-xs tracking-[0.06em] text-ink-muted underline underline-offset-4 transition-colors duration-200 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8c8ff]"
        >
          {PLACE_COPY.mapLink}
        </a>
      )}
      {found && (
        <label htmlFor="memory-location" className={cn("flex cursor-pointer items-center gap-3 text-ink", disabled && "cursor-default")}>
          <input
            id="memory-location"
            type="checkbox"
            checked={consent}
            onChange={(e) => onConsentChange(e.target.checked)}
            disabled={disabled}
            aria-describedby="memory-place-help"
            data-magnetic="light"
            data-cursor-label="Guardar lugar"
            className="h-4 w-4 shrink-0 cursor-pointer accent-[#a8c8ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8c8ff]"
          />
          <span className="t-body text-[length:var(--type-1)]">{PLACE_COPY.consent}</span>
        </label>
      )}
      <p id="memory-place-help" className="m-0 text-xs tracking-[0.04em] text-ink-faint">
        {PLACE_COPY.help}
      </p>
    </div>
  )
}
