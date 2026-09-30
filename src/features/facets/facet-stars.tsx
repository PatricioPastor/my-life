"use client"

import type { Ref, RefObject } from "react"
import type { HalftoneSkyHandle } from "@/features/sky"
import { PALETTE } from "@/shared/lib/palette"
import type { Facet } from "./content"

interface FacetStarsProps {
  facets: readonly Facet[]
  hovered: string | null
  sky: RefObject<HalftoneSkyHandle | null>
  onHover: (id: string | null) => void
  onOpen: (facet: Facet) => void
  /** The label layer; the sky moves it for parallax, so labels ride with the sparkles they name. */
  layerRef?: Ref<HTMLDivElement>
}

export function FacetStars({ facets, hovered, sky, onHover, onOpen, layerRef }: FacetStarsProps) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div ref={layerRef} className="absolute inset-0">
        {facets.map((f) => (
          <button
            key={f.id}
            type="button"
            className="press pointer-events-auto absolute -mt-6 -ml-6 size-12"
            style={{ left: `${(f.x * 100).toFixed(2)}%`, top: `${((1 - f.y) * 100).toFixed(2)}%` }}
            onClick={() => {
              sky.current?.pulse(f.x, f.y)
              onOpen(f)
            }}
            onMouseEnter={() => onHover(f.id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => {
              sky.current?.aim(f.x, f.y)
              onHover(f.id)
            }}
            onBlur={() => onHover(null)}
          >
            <span
              className="absolute top-1/2 left-11 -translate-y-1/2 text-xs tracking-[0.08em] whitespace-nowrap text-ink [text-shadow:0_1px_10px_rgba(0,0,0,0.9)]"
              style={hovered === f.id ? { color: PALETTE[f.color] } : undefined}
            >
              {f.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
