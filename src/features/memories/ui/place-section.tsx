"use client"

import type { ReactNode } from "react"
import { cn } from "@/shared/lib/utils"
import { coordinatesLabel, googleMapsUrl, linkPlaceLabel, PLACE_COPY, suggestionLabel } from "./place-model"
import { ERROR, HINT, INPUT, LABEL } from "./sheet-styles"
import type { MapsLinkState } from "./use-maps-link"
import type { PhotoPlace } from "./use-photo-place"

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
  /** Why the form will not go on with this link (still being read, or not understood), shown beside it. */
  error?: string
  /** Another way to answer the same question, right under the heading ("Mismo lugar"). */
  children?: ReactNode
}

/** The place to show: the link's when it resolved (it replaces the photo's suggestion), else the photo's. */
function shownPlace(place: PhotoPlace, link: MapsLinkState) {
  if (link.status === "ok") {
    return {
      lat: link.lat,
      lng: link.lng,
      text: link.label ? linkPlaceLabel(link.label) : coordinatesLabel(link.lat, link.lng),
      address: link.address,
    }
  }
  // Before the consent the photo's position is not shown (no coordinates, no name, no map link): only that it has one.
  if (place.status === "found" && place.awaitingConsent) {
    return { lat: null, lng: null, text: PLACE_COPY.awaitingConsent, address: null }
  }
  if (place.status === "found") {
    const text = place.naming
      ? PLACE_COPY.naming
      : place.label
        ? suggestionLabel(place.label)
        : coordinatesLabel(place.lat, place.lng)
    return { lat: place.lat, lng: place.lng, text, address: place.naming ? null : place.address }
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
 * "¿Dónde fue?": where the PHOTO was taken, suggested from its own GPS (never the visitor's location). The visitor can
 * check the spot on the map, correct it with a Google Maps link, and decides whether to keep it. The link field stays
 * while it holds text, so a link the form will not take can always be fixed or cleared.
 */
export function PlaceSection({ place, link, onLinkChange, consent, onConsentChange, disabled, error, children }: PlaceSectionProps) {
  const shown = shownPlace(place, link.state)
  const asksForLink = place.status === "found" || place.status === "none" || link.text.trim() !== ""
  const linkErrorId = link.state.status === "error" ? "memory-link-error" : undefined
  const blockedId = error ? "memory-place-error" : undefined
  // What the place is for is only said while there is a place to keep: with none, it would contradict the status.
  const helpId = shown ? "memory-place-help" : undefined
  const describedBy = [helpId, linkErrorId, blockedId].filter(Boolean).join(" ") || undefined

  return (
    <div role="group" aria-labelledby="memory-place-label" className="flex flex-col gap-2">
      <span id="memory-place-label" className={LABEL}>
        {PLACE_COPY.heading}
      </span>
      {children}
      {/*
        What the place is, and where to check it, share a line when there is room. A place reads in the fields' ink; with
        none yet (no photo, reading it, no location) the line is a hint like the others, never a second heading.
      */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p id="memory-place-status" aria-live="polite" className={cn(HINT, shown && "text-[length:var(--type-1)] text-ink")}>
          {statusText(place, link.state)}
        </p>
        {shown && shown.lat !== null && shown.lng !== null && (
          <a
            href={googleMapsUrl(shown.lat, shown.lng)}
            target="_blank"
            rel="noopener noreferrer"
            data-magnetic="light"
            data-cursor-label="Abrir mapa"
            className="t-body w-fit text-sm text-ink-muted underline underline-offset-4 transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8c8ff]"
          >
            {PLACE_COPY.mapLink}
          </a>
        )}
      </div>
      {shown?.address && (
        <p id="memory-place-address" className={cn(HINT, "[overflow-wrap:anywhere]")}>
          {shown.address}
        </p>
      )}
      {shown && (
        <label
          htmlFor="memory-location"
          className={cn("flex min-h-11 cursor-pointer items-center gap-3 text-ink", disabled && "cursor-default")}
        >
          <input
            id="memory-location"
            type="checkbox"
            checked={consent}
            onChange={(e) => onConsentChange(e.target.checked)}
            disabled={disabled}
            aria-describedby="memory-place-help"
            data-magnetic="light"
            data-cursor-label="Guardar lugar"
            className="size-[1.125rem] shrink-0 cursor-pointer accent-[#a8c8ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8c8ff]"
          />
          <span className="t-body text-pretty text-sm leading-snug">{PLACE_COPY.consent}</span>
        </label>
      )}
      {asksForLink && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="memory-maps-link" className={cn(HINT, "block")}>
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
            aria-invalid={linkErrorId || blockedId ? true : undefined}
            className={INPUT}
          />
          {link.state.status === "resolving" && (
            <p role="status" className={HINT}>
              {PLACE_COPY.linkReading}
            </p>
          )}
          {link.state.status === "error" && (
            <p id="memory-link-error" className={ERROR}>
              {link.state.message}
            </p>
          )}
          {error && (
            <p id="memory-place-error" role="alert" className={ERROR}>
              {error}
            </p>
          )}
        </div>
      )}
      {helpId && (
        <p id={helpId} className={HINT}>
          {PLACE_COPY.help}
        </p>
      )}
    </div>
  )
}
