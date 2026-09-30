import { PALETTE } from "@/shared/lib/palette"
import { cn } from "@/shared/lib/utils"
import type { Facet } from "./content"

interface FacetPlaceProps {
  facet: Facet
  /** Which side the entry list sits on (opposite the star you dove into). */
  listSide: "left" | "right"
  onOpenEntry: (index: number) => void
}

export function FacetPlace({ facet, listSide, onOpenEntry }: FacetPlaceProps) {
  return (
    <>
      <h1 className="rise-late absolute bottom-[72px] left-6 m-0 font-display text-[clamp(56px,11.1vw,160px)] leading-[0.82] font-black tracking-[-0.02em] md:left-20"
        style={{ color: PALETTE[facet.color] }}
      >
        {facet.name}
      </h1>
      <ol
        className={cn(
          "absolute top-[108px] right-6 left-6 m-0 flex list-none flex-col gap-1 p-0 md:top-[132px] md:w-[540px]",
          listSide === "left" ? "md:right-auto md:left-[88px]" : "md:right-[88px] md:left-auto",
        )}
      >
        {facet.entries.map((entry, i) => (
          <li key={i} className="rise" style={{ animationDelay: `${520 + i * 60}ms` }}>
            <button
              type="button"
              onClick={() => onOpenEntry(i)}
              className="row press flex min-h-[72px] w-full items-center gap-5 text-left"
            >
              <span className="mark size-2 shrink-0 bg-signal" />
              <span className="shift flex grow items-baseline gap-6">
                <span className="w-28 shrink-0 text-xs tracking-[0.06em] text-ink-muted">{entry.meta}</span>
                <span className="font-serif text-[30px] leading-[1.2] text-ink">{entry.title}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </>
  )
}
