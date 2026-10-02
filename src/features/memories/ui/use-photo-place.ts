"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { SuggestPlaceResult } from "../place/suggest-place"
import { readPhotoGps, type GpsParser } from "./photo-gps"

/** What the form knows about where the picked photo was taken. The position is the photo's exact one. */
export type PhotoPlace =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "none" }
  /**
   * `label` is null while the place is being named, or when it has no name (the form shows the coordinates); `address`
   * is the street address, null while naming or when the geocoder found no street.
   */
  | { status: "found"; lat: number; lng: number; label: string | null; address: string | null; naming: boolean }

export type SuggestPlace = (input: { lat: number; lng: number }) => Promise<SuggestPlaceResult>

/**
 * Container logic for the photo's suggested place: reads the GPS of the picked photo in the browser and asks the
 * server to name it and find its street address (the exact position, to the 6 decimals the database keeps). Each `begin` supersedes the one before, so a
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

      setPlace({ status: "found", ...position, label: null, address: null, naming: true })
      let label: string | null = null
      let address: string | null = null
      try {
        const answer = await suggest(position)
        if (answer.ok) {
          label = answer.label
          address = answer.address
        }
      } catch {
        // No label and no address: the form shows the coordinates instead.
      }
      if (mine !== run.current) return
      setPlace({ status: "found", ...position, label, address, naming: false })
    },
    [parseGps, suggest],
  )

  const reset = useCallback(() => {
    run.current += 1
    setPlace({ status: "idle" })
  }, [])

  return { place, begin, reset }
}
