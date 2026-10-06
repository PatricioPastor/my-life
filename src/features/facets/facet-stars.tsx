"use client"

import { Fragment, useSyncExternalStore, type Ref, type RefObject } from "react"
import type { HalftoneSkyHandle } from "@/features/sky"
import { STAR_HEX } from "@/shared/lib/palette"
import type { Facet } from "./content"
import { estimateLabelWidth, labelSide } from "./label-side"

function subscribeResize(notify: () => void) {
  window.addEventListener("resize", notify)
  return () => window.removeEventListener("resize", notify)
}
const viewportWidth = () => window.innerWidth
// Before hydration there is no window; desktop is the safe guess (the stars only mount after the gate).
const SERVER_WIDTH = 1280

const HIT = "absolute -mt-6 -ml-6 size-12"
const LABEL_SHADOW = "[text-shadow:0_0_2px_#0A0600,0_0_5px_rgba(10,6,0,0.95),0_1px_14px_rgba(10,6,0,0.95)]"

/** A star's name, on whichever side of it fits; `ink` is the lit star's full ink or an off star's faint one. */
const labelClass = (side: "left" | "right", ink: string) =>
  `absolute top-1/2 -translate-y-1/2 text-xs ${side === "right" ? "left-11" : "right-11"} tracking-[0.08em] whitespace-nowrap ${ink} ${LABEL_SHADOW}`

const positionOf = (f: Facet) => ({ left: `${(f.x * 100).toFixed(2)}%`, top: `${((1 - f.y) * 100).toFixed(2)}%` })

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
  const width = useSyncExternalStore(subscribeResize, viewportWidth, () => SERVER_WIDTH)
  return (
    <div className="pointer-events-none absolute inset-0">
      <div ref={layerRef} className="absolute inset-0">
        {facets.map((f) => {
          const side = labelSide(f.x * width, estimateLabelWidth(f.name), width)
          // An off star is only drawn: no button, nothing the cursor can capture, and hidden from assistive tech.
          if (f.off) {
            return (
              <span key={f.id} aria-hidden="true" className={`pointer-events-none ${HIT}`} style={positionOf(f)}>
                <span className={labelClass(side, "text-ink-faint")}>{f.name}</span>
              </span>
            )
          }
          const descId = `facet-${f.id}-description`
          return (
            <Fragment key={f.id}>
              <button
                type="button"
                className={`press pointer-events-auto ${HIT}`}
                aria-describedby={descId}
                data-magnetic="strong"
                data-cursor-id={f.id}
                data-cursor-label={f.name}
                data-cursor-context={f.description}
                style={positionOf(f)}
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
                  className={labelClass(side, "text-ink")}
                  style={hovered === f.id ? { color: STAR_HEX[f.color] } : undefined}
                >
                  {f.name}
                </span>
              </button>
              {/* Outside the button, so it describes it without becoming part of its name. */}
              <span id={descId} className="sr-only">
                {f.description}
              </span>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
