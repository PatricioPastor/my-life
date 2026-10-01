"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { readPhotoPalette, type PhotoPalette } from "./photo-palette"

/** What the form knows about the colors of the picked photo. */
export type PalettePhase =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "ready"; colors: readonly string[]; fromPhoto: boolean }

export type ReadPalette = (file: Blob) => Promise<PhotoPalette>

/**
 * Container logic for the orb color swatches: reads the colors of the picked photo in the browser. Each `begin`
 * supersedes the one before, so a slow answer for a photo that is no longer picked is ignored. Reading never fails:
 * a photo that cannot be drawn gives the site's cool palette instead.
 */
export function usePhotoPalette(read: ReadPalette = readPhotoPalette) {
  const [phase, setPhase] = useState<PalettePhase>({ status: "idle" })
  const run = useRef(0)

  useEffect(
    () => () => {
      run.current += 1
    },
    [],
  )

  const begin = useCallback(
    async (file: Blob) => {
      const mine = ++run.current
      setPhase({ status: "reading" })
      let palette: PhotoPalette
      try {
        palette = await read(file)
      } catch {
        // `readPhotoPalette` never throws, but a stand-in might: no colors to offer.
        if (mine === run.current) setPhase({ status: "idle" })
        return
      }
      if (mine !== run.current) return
      setPhase({ status: "ready", colors: palette.colors, fromPhoto: palette.fromPhoto })
    },
    [read],
  )

  const reset = useCallback(() => {
    run.current += 1
    setPhase({ status: "idle" })
  }, [])

  return { phase, begin, reset }
}
