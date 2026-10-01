"use client"

import { useEffect, useMemo, useState, type CSSProperties, type Ref } from "react"
import type { MemoryView } from "../memory-view"
import { approachSizes, bestDecoded, ladderOf, type PhotoSize } from "../photo-ladder"
import type { PhotoCache } from "./photo-cache"

/** How long a sharper size takes to fade in over the one under it. */
export const DISC_FADE_MS = 220

interface FocusDiscProps {
  /** The memory being approached, or null. */
  memory: MemoryView | null
  cache: PhotoCache
  /** The sphere's diameter in CSS px: the disc is laid out at it and only ever scaled down. */
  diameter: number
  dpr: number
  ref?: Ref<HTMLDivElement>
}

interface Layer {
  url: string
  width: number
  enter: boolean
}

const NO_SIZES: readonly PhotoSize[] = []

/**
 * The orb being approached, drawn as a disc the size of the glass and scaled down to the orb, so it is never an
 * enlarged thumbnail: it holds the sharpest photo already decoded and fades each sharper size in over it as it lands
 * (decoded first, so no frame waits on it). Under the photos lies the orb's own light, so it is never blank. The
 * constellation loop places it and sets how big it is every frame.
 */
export function FocusDisc({ memory, cache, diameter, dpr, ref }: FocusDiscProps) {
  const ladder = useMemo(() => (memory ? ladderOf(memory) : NO_SIZES), [memory])
  const pick = () => bestDecoded(ladder, cache.isDecoded, diameter, dpr)

  const [shownFor, setShownFor] = useState<string | null>(null)
  const [layers, setLayers] = useState<Layer[]>([])
  const id = memory?.id ?? null
  if (id !== shownFor) {
    // Another memory: start from the best it already has, with no fade (the disc itself fades in).
    const best = pick()
    setShownFor(id)
    setLayers(best ? [{ url: best.url, width: best.width, enter: false }] : [])
  }

  // The approach has begun: the mid size and then the glass size are on their way.
  useEffect(() => {
    if (ladder.length === 0) return
    cache.warm(approachSizes(ladder, diameter, dpr))
  }, [cache, ladder, diameter, dpr])

  // A sharper size has been decoded: fade it in over what is shown.
  useEffect(
    () =>
      cache.subscribe((url) => {
        if (!ladder.some((size) => size.url === url)) return
        const best = bestDecoded(ladder, cache.isDecoded, diameter, dpr)
        if (!best) return
        setLayers((prev) => {
          const top = prev[prev.length - 1]
          if (top && top.width >= best.width) return prev
          return [...prev, { url: best.url, width: best.width, enter: true }]
        })
      }),
    [cache, ladder, diameter, dpr],
  )

  // Once the newest has faded in, the ones under it go.
  useEffect(() => {
    if (layers.length < 2) return
    const done = window.setTimeout(() => setLayers((prev) => prev.slice(-1)), DISC_FADE_MS + 80)
    return () => window.clearTimeout(done)
  }, [layers])

  const style = {
    width: diameter,
    height: diameter,
    "--d": `${diameter}px`,
    ...(memory ? { "--pc": memory.orbColor } : {}),
  } as CSSProperties
  return (
    <div ref={ref} data-focus-disc data-on="false" aria-hidden="true" className="mem-disc pointer-events-none absolute top-0 left-0" style={style}>
      <span data-disc-light className="mem-disc-light" />
      {layers.map((layer) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={layer.url}
          src={layer.url}
          alt=""
          crossOrigin="anonymous"
          decoding="async"
          draggable={false}
          data-enter={layer.enter || undefined}
        />
      ))}
    </div>
  )
}
