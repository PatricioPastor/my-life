"use client"

import { useId, useRef } from "react"
import { useReducedMotion } from "@/features/onboarding/reader/use-reduced-motion"
import { STAR_HEX } from "@/shared/lib/palette"
import { cn } from "@/shared/lib/utils"
import { GRID, GRID_ASIDE, GRID_CONTENT, GRID_X } from "@/shared/ui/grid"
import { TITLE_LABEL, usePlaceTitle } from "@/shared/ui/place-title"
import type { Facet, FacetEntry } from "./content"

interface FacetPlaceProps {
  facet: Facet
  onOpenEntry: (index: number) => void
}

/**
 * The large title at the bottom, on the grid's first column (less its first letter's side bearing, as the label is);
 * the label it becomes is the shared place title's, under the way back. A short landscape screen shrinks and lowers it.
 */
const TITLE_HERO =
  "bottom-[calc(72px+env(safe-area-inset-bottom))] left-[calc(var(--grid-left)-var(--title-bearing))] text-[clamp(56px,11.1vw,160px)] leading-[0.82] [@media(max-height:520px)]:bottom-[calc(32px+env(safe-area-inset-bottom))] [@media(max-height:520px)]:text-[32px]"

/** The list, across the grid, clear of the label under the way back (76 px down on a desktop width, 64 on a phone). */
const LIST = `absolute ${GRID_X} top-[calc(108px+env(safe-area-inset-top))] m-0 flex list-none flex-col gap-1 p-0 md:top-[132px] [@media(max-height:520px)]:top-[112px]`

/**
 * A facet's place: its entries on the six-column grid (a reference they line up on, never drawn), and its name as the
 * place's title: large on arrival, in the facet's pixel face and star color, then the small label under the way back
 * (the same motion as "Recuerdos").
 */
export function FacetPlace({ facet, onOpenEntry }: FacetPlaceProps) {
  const reduced = useReducedMotion()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const title = usePlaceTitle(titleRef, { reduced })
  const id = useId()
  return (
    <>
      <h1
        ref={titleRef}
        data-title={title.mode}
        data-fading={title.fading}
        // The same face in both states, so the FLIP scales the very word it started from.
        className={`place-title pointer-events-none absolute m-0 font-display font-black tracking-[-0.02em] ${title.mode === "hero" ? TITLE_HERO : TITLE_LABEL}`}
        style={{ color: STAR_HEX[facet.color] }}
      >
        {/* The rise on arrival lives on the word, so it never fights the FLIP on the heading. */}
        <span className="rise-late inline-block">{facet.name}</span>
      </h1>
      <ol className={LIST}>
        {facet.entries.map((entry, i) => (
          <li key={i} className="rise" style={{ animationDelay: `${520 + i * 60}ms` }}>
            <EntryRow entry={entry} id={`${id}-${i}`} onOpen={() => onOpenEntry(i)} />
          </li>
        ))}
      </ol>
    </>
  )
}

/**
 * One entry, one button, on the grid: the meta in the left zone; in the content zone the full logo (or the title, when
 * there is none) on the third guide and the summary on the fifth. A phone stacks them on the same axis. It is named by
 * what it is (the title and the summary) and described by its meta.
 */
function EntryRow({ entry, id, onOpen }: { entry: FacetEntry; id: string; onOpen: () => void }) {
  const ids = { meta: `${id}-meta`, name: `${id}-name`, summary: `${id}-summary` }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-labelledby={entry.summary ? `${ids.name} ${ids.summary}` : ids.name}
      aria-describedby={ids.meta}
      data-magnetic="light"
      data-cursor-label="Abrir"
      className="row press relative flex min-h-[72px] w-full items-center text-left [@media(max-height:520px)]:min-h-[56px]"
    >
      {/* The hover and focus mark hangs in the margin, so the row's own edge stays on the guide. */}
      <span className="mark absolute top-1/2 -left-4 size-2 -translate-y-1/2 bg-signal" />
      <span className={cn("shift flex w-full max-md:flex-col max-md:gap-1.5 md:items-center", GRID)}>
        <span id={ids.meta} className={cn(GRID_ASIDE, "text-xs tracking-[0.06em] text-ink-muted")}>
          {entry.meta}
        </span>
        {/* Two halves of the content zone with the grid's own gutter, so the second starts on the fifth guide. */}
        <span className={cn(GRID_CONTENT, "flex flex-col gap-1.5 md:grid md:grid-cols-2 md:items-center md:gap-x-(--grid-gap)")}>
          <span id={ids.name} className={cn(!entry.summary && "md:col-span-2")}>
            {entry.logo ? (
              // The full logo, a vector from public/ (next/image would serve it as is), kept to the row's height.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={entry.logo} alt={entry.title} draggable={false} className="block h-6 w-auto max-w-full md:h-7" />
            ) : (
              <span className="font-serif text-[30px] leading-[1.2] text-ink">
                {entry.mark && (
                  // Decoration only, since the name beside it says the same; its tip dips a hair under the baseline to
                  // sit optically on it.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.mark} alt="" draggable={false} className="mr-3 inline-block h-[0.7em] w-auto align-[-0.06em]" />
                )}
                {entry.title}
              </span>
            )}
          </span>
          {entry.summary && (
            <span id={ids.summary} className="font-serif text-[length:var(--type-1)] leading-[1.4] text-ink-muted">
              {entry.summary}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}
