"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { SuggestPlaceResult } from "../place/suggest-place"
import { readPhotoGps, type GpsParser } from "./photo-gps"

/** What the form knows about where the picked photo was taken. Positions are always rounded to 2 decimals. */
export type PhotoPlace =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "none" }
  /** `label` is null while the place is being named, or when it has no name (the form shows the coordinates). */
  | { status: "found"; lat: number; lng: number; label: string | null; naming: boolean }

export type SuggestPlace = (input: { lat: number; lng: number }) => Promise<SuggestPlaceResult>

/**
 * Container logic for the photo's suggested place: reads the GPS of the picked photo in the browser, rounds it, and
 * asks the server to name it. Only the rounded position is ever sent. Each `begin` supersedes the one before, so a
 * slow answer for a photo that is no longer picked is ignored. Failures only mean "no label": nothing blocks saving.
 */
export function usePhotoPlace(parseGps: GpsParser | undefined, suggest: SuggestPlace) {
  const [place, setPlace] = useState<PhotoPlace>({ status: "idle" })
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
      setPlace({ status: "reading" })
      const position = await readPhotoGps(file, parseGps)
      if (mine !== run.current) return
      if (!position) return setPlace({ status: "none" })

      setPlace({ status: "found", ...position, label: null, naming: true })
      let label: string | null = null
      try {
        const answer = await suggest(position)
        if (answer.ok) label = answer.label
      } catch {
        // No label: the form shows the rounded coordinates instead.
      }
      if (mine !== run.current) return
      setPlace({ status: "found", ...position, label, naming: false })
    },
    [parseGps, suggest],
  )

  const reset = useCallback(() => {
    run.current += 1
    setPlace({ status: "idle" })
  }, [])

  return { place, begin, reset }
}
