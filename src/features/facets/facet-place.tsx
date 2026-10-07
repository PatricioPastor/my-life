"use client"

import { useId, useRef } from "react"
import { useReducedMotion } from "@/features/onboarding/reader/use-reduced-motion"
import { STAR_HEX } from "@/shared/lib/palette"
import { cn } from "@/shared/lib/utils"
import { GRID_X } from "@/shared/ui/grid"
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

/**
 * The list, between the grid's insets, clear of the label under the way back (76 px down on a desktop width, 64 on a
 * phone). From md it is two columns every row shares: the widest name (a logo, or a title), then the summaries, as wide
 * as the longest one or as the room left, so every summary starts at one x. Neither column stretches to the list's
 * width, so a row is only as wide as what it holds.
 */
const LIST = `absolute ${GRID_X} top-[calc(108px+env(safe-area-inset-top))] m-0 flex list-none flex-col gap-y-1 p-0 md:top-[132px] md:grid md:grid-cols-[max-content_minmax(0,max-content)] [@media(max-height:520px)]:top-[112px]`

/** A row's part of the list's two columns, passed down from the item to the button to the line that shifts on hover. */
const COLUMNS = "md:col-span-2 md:grid md:grid-cols-subgrid"

/**
 * A facet's place: its entries from the grid's first column (the axis its small title hangs from), and its name as the
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
          <li key={i} className={cn("rise", COLUMNS)} style={{ animationDelay: `${520 + i * 60}ms` }}>
            <EntryRow entry={entry} id={`${id}-${i}`} onOpen={() => onOpenEntry(i)} />
          </li>
        ))}
      </ol>
    </>
  )
}

/**
 * One entry, one button: from the axis, on one line, the full logo (or the title, when there is none), then after a
 * fixed gap the summary. They read as one line of type: the summary sits on the logo's baseline (an image's is its
 * foot, a wordmark's own where it has no descender), and the pair is centred in the row. The logo sits in the list's
 * first column and the summary in its second, so every row's summary starts at the same x. A phone stacks the logo over
 * the summary, both on the axis. The button ends where its row's content does, so the cursor's frame and the focus ring
 * hug it; on a phone it spans the column, for a wide target. It is named by what it is: the title and the summary. The
 * meta is left to the case study.
 */
function EntryRow({ entry, id, onOpen }: { entry: FacetEntry; id: string; onOpen: () => void }) {
  const ids = { name: `${id}-name`, summary: `${id}-summary` }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-labelledby={entry.summary ? `${ids.name} ${ids.summary}` : ids.name}
      data-magnetic="light"
      data-cursor-label="Abrir"
      className={cn("row press relative flex min-h-[72px] items-center text-left max-md:w-full [@media(max-height:520px)]:min-h-[56px]", COLUMNS)}
    >
      {/* The hover and focus mark hangs in the margin, so the row's own edge stays on the axis. */}
      <span className="mark absolute top-1/2 -left-4 size-2 -translate-y-1/2 bg-signal" />
      <span className={cn("shift flex max-md:w-full max-md:flex-col max-md:gap-1.5 md:items-baseline", COLUMNS)}>
        <span id={ids.name}>
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
        {/* The gap before it is its own (2rem), so a list with no summary keeps no empty column after its names. */}
        {entry.summary && (
          <span id={ids.summary} className="font-serif text-[length:var(--type-1)] leading-[1.4] text-ink-muted md:pl-(--space-4)">
            {entry.summary}
          </span>
        )}
      </span>
    </button>
  )
}
