"use client"

import { useMemo, useState, type CSSProperties } from "react"
import { formatMemoryDate, truncateCaption } from "../format"
import type { MemoryView } from "../memory-view"
import { rimColor } from "../orb-color"
import { memoriesKeepOut } from "./keep-out"
import { orbDepth, orbMetrics } from "./orb-depth"
import { driftFor, layoutPoints } from "./point-layout"
import { useViewport } from "./use-viewport"

const LABEL_MAX = 28
const STAGGER_MS = 55
const STAGGER_CAP = 24
const NARROW_PX = 640

interface MemoryPointsProps {
  memories: readonly MemoryView[]
  reduced: boolean
  onOpen: (id: string, origin: { x: number; y: number }) => void
}

type PointStyle = CSSProperties & Record<`--${string}`, string>

/**
 * One soft round orb per memory, floating in the void, tinted with the memory's own color (its core, halo and
 * rim). Each sits at its own seeded depth (which sets its size, focus and brightness), fades in once its thumbnail has loaded (staggered, so the constellation
 * assembles), drifts on its own slow wobble, and is a real button named by its caption and date; the DOM
 * follows the list order.
 */
export function MemoryPoints({ memories, reduced, onOpen }: MemoryPointsProps) {
  const { width, height } = useViewport()
  const [ready, setReady] = useState<ReadonlySet<string>>(() => new Set())
  const markReady = (id: string) => setReady((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))

  const points = useMemo(() => {
    const narrow = width < NARROW_PX
    return layoutPoints(
      memories.map((m) => m.id),
      {
        width,
        height,
        margin: narrow ? 36 : 56,
        spacing: narrow ? 44 : 60,
        keepOut: memoriesKeepOut(width, height),
      },
    )
  }, [memories, width, height])

  return (
    <ul aria-label="Recuerdos" className="pointer-events-none absolute inset-0 m-0 list-none p-0">
      {memories.map((memory, index) => {
        const { x, y } = points[index]
        const orb = orbMetrics(orbDepth(memory.id))
        const drift = driftFor(memory.id)
        const date = formatMemoryDate(memory.happenedOn)
        const pending = memory.status === "pending"
        const style: PointStyle = {
          "--pc": memory.orbColor,
          // The neighbouring hue of the orb's own color, for its chromatic rim.
          "--rim": rimColor(memory.orbColor),
          "--size": `${orb.size.toFixed(1)}px`,
          "--alpha": orb.alpha.toFixed(2),
          "--soft": orb.softness.toFixed(2),
          "--dx": `${(drift.dx * orb.driftScale).toFixed(1)}px`,
          "--dy": `${(drift.dy * orb.driftScale).toFixed(1)}px`,
          "--dur": `${drift.duration.toFixed(1)}s`,
          "--delay": `${drift.delay.toFixed(1)}s`,
          "--stagger": `${Math.min(index, STAGGER_CAP) * STAGGER_MS}ms`,
        }
        return (
          <li key={memory.id} className="absolute size-0" style={{ left: x, top: y }}>
            <button
              type="button"
              className="mem-point pointer-events-auto absolute -mt-[22px] -ml-[22px] size-11"
              style={style}
              aria-label={`${memory.caption}, ${date}${pending ? ", pendiente" : ""}`}
              data-magnetic="light"
              data-cursor-id={memory.id}
              data-cursor-label={truncateCaption(memory.caption, LABEL_MAX)}
              data-cursor-context={date}
              data-memory-id={memory.id}
              data-ready={ready.has(memory.id)}
              data-pending={pending}
              data-reduced={reduced}
              onClick={() => onOpen(memory.id, { x, y })}
            >
              <span className="mem-drift" aria-hidden="true">
                <span className="mem-dot" />
                <span className="mem-thumb">
                  {/* A Cloudinary URL that is already sized and optimized (f_auto, q_auto, 160 px); next/image would only re-proxy it. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={memory.thumbUrl}
                    alt=""
                    // A cached or server-rendered image can finish before React attaches onLoad.
                    ref={(img) => {
                      if (img?.complete) markReady(memory.id)
                    }}
                    decoding="async"
                    draggable={false}
                    onLoad={() => markReady(memory.id)}
                    onError={() => markReady(memory.id)}
                  />
                </span>
                {pending && <span className="mem-pending">Pendiente</span>}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
