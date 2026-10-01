import type { Memory } from "../memory"

interface MemoriesPlaceProps {
  /** The approved memories to show. Empty shows the empty state. */
  memories: readonly Memory[]
  /** Title color; defaults to the site's ink. */
  accent?: string
}

/**
 * The memories space: a quiet place on the same dark ground as the facets. It holds only what it shows;
 * the way back belongs to the journey, so it matches the facet places.
 */
export function MemoriesPlace({ memories, accent }: MemoriesPlaceProps) {
  return (
    <>
      <h1
        className="rise-late absolute bottom-[72px] left-6 m-0 font-display text-[clamp(56px,11.1vw,160px)] leading-[0.82] font-black tracking-[-0.02em] text-ink md:left-20"
        style={accent ? { color: accent } : undefined}
      >
        Recuerdos
      </h1>
      {memories.length === 0 ? (
        <p className="rise absolute inset-x-6 top-1/2 m-0 -translate-y-1/2 text-center text-xs tracking-[0.08em] text-ink-muted">
          Todavía no hay recuerdos.
        </p>
      ) : (
        <ul
          aria-label="Recuerdos"
          className="absolute top-[108px] right-6 left-6 m-0 flex list-none flex-col gap-3 p-0 md:top-[132px] md:right-[88px] md:left-auto md:w-[540px]"
        >
          {memories.map((memory) => (
            <li key={memory.id} className="rise font-serif text-[22px] leading-[1.3] text-ink">
              {memory.caption}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
