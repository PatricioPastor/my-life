"use client"

import { cn } from "@/shared/lib/utils"
import { coordinatesLabel, googleMapsUrl, linkPlaceLabel, PLACE_COPY, suggestionLabel } from "./place-model"
import type { MapsLinkState } from "./use-maps-link"
import type { PhotoPlace } from "./use-photo-place"

const LABEL_CLASS = "t-label text-ink-muted"
const FIELD_CLASS = cn(
  "border border-[#a8c8ff]/25",
  "w-full rounded-sm bg-white/[0.04] px-3 py-2.5 text-ink outline-none transition-colors duration-200 placeholder:text-ink-faint",
  "focus-visible:border-[#a8c8ff]/70 aria-[invalid=true]:border-signal/70",
)

interface PlaceSectionProps {
  /** What the photo's own GPS says. */
  place: PhotoPlace
  /** The Google Maps link the visitor pasted, and what the server made of it. */
  link: { text: string; state: MapsLinkState }
  onLinkChange: (text: string) => void
  /** The visitor's consent to keep the place. */
  consent: boolean
  onConsentChange: (next: boolean) => void
  disabled: boolean
}

/** The place to show: the link's when it resolved (it replaces the photo's suggestion), else the photo's. */
function shownPlace(place: PhotoPlace, link: MapsLinkState) {
  if (link.status === "ok") {
    return { lat: link.lat, lng: link.lng, text: link.label ? linkPlaceLabel(link.label) : coordinatesLabel(link.lat, link.lng) }
  }
  if (place.status === "found") {
    const text = place.naming
      ? PLACE_COPY.naming
      : place.label
        ? suggestionLabel(place.label)
        : coordinatesLabel(place.lat, place.lng)
    return { lat: place.lat, lng: place.lng, text }
  }
  return null
}

function statusText(place: PhotoPlace, link: MapsLinkState): string {
  const shown = shownPlace(place, link)
  if (shown) return shown.text
  switch (place.status) {
    case "idle":
      return PLACE_COPY.idle
    case "reading":
      return PLACE_COPY.reading
    case "none":
      return PLACE_COPY.noGps
    case "found":
      return PLACE_COPY.naming // unreachable: a found place is always shown
  }
}

/**
 * "¿Dónde se sacó?": where the PHOTO was taken, suggested from its own GPS (never the visitor's location). The
 * visitor can check the spot on the map, correct it with a Google Maps link, and decides whether to keep it.
 */
export function PlaceSection({ place, link, onLinkChange, consent, onConsentChange, disabled }: PlaceSectionProps) {
  const shown = shownPlace(place, link.state)
  const asksForLink = place.status === "found" || place.status === "none"
  const errorId = link.state.status === "error" ? "memory-link-error" : undefined
  const describedBy = ["memory-place-help", errorId].filter(Boolean).join(" ")

  return (
    <div role="group" aria-labelledby="memory-place-label" className="flex flex-col gap-2">
      <span id="memory-place-label" className={LABEL_CLASS}>
        {PLACE_COPY.heading}
      </span>
      <p id="memory-place-status" aria-live="polite" className="t-body m-0 text-[length:var(--type-1)] text-ink">
        {statusText(place, link.state)}
      </p>
      {shown && (
        <a
          href={googleMapsUrl(shown.lat, shown.lng)}
          target="_blank"
          rel="noopener noreferrer"
          data-magnetic="light"
          data-cursor-label="Abrir mapa"
          className="w-fit text-xs tracking-[0.06em] text-ink-muted underline underline-offset-4 transition-colors duration-200 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8c8ff]"
        >
          {PLACE_COPY.mapLink}
        </a>
      )}
      {shown && (
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
      {asksForLink && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="memory-maps-link" className="t-body text-[length:var(--type-1)] text-ink-muted">
            {place.status === "found" ? PLACE_COPY.linkLabelFound : PLACE_COPY.linkLabelNone}
          </label>
          <input
            id="memory-maps-link"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={link.text}
            onChange={(e) => onLinkChange(e.target.value)}
            disabled={disabled}
            placeholder={PLACE_COPY.linkPlaceholder}
            aria-describedby={describedBy}
            aria-invalid={errorId ? true : undefined}
            className={cn(FIELD_CLASS, "text-[length:var(--type-1)]")}
          />
          {link.state.status === "resolving" && (
            <p role="status" className="m-0 text-xs tracking-[0.04em] text-ink-muted">
              {PLACE_COPY.linkReading}
            </p>
          )}
          {link.state.status === "error" && (
            <p id="memory-link-error" className="t-body m-0 text-[length:var(--type-1)] leading-snug text-signal">
              {link.state.message}
            </p>
          )}
        </div>
      )}
      <p id="memory-place-help" className="m-0 text-xs tracking-[0.04em] text-ink-faint">
        {PLACE_COPY.help}
      </p>
    </div>
  )
}
