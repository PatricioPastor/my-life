"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { SuggestPlaceResult } from "../place/suggest-place"
import { readPhotoGps, type GpsParser } from "./photo-gps"

/** What the form knows about where the picked photo was taken. The position is the photo's exact one and stays in the browser until the visitor consents. */
export type PhotoPlace =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "none" }
  /**
   * `awaitingConsent` is true while the photo's position has been read but not sent anywhere (the visitor has not ticked the
   * consent): the form shows no coordinates and no name. `label` is null while the place is being named, or when it has no
   * name (the form shows the coordinates); `address` is the street address, null while naming or when the geocoder found no street.
   */
  | {
      status: "found"
      lat: number
      lng: number
      label: string | null
      address: string | null
      naming: boolean
      awaitingConsent: boolean
    }

export type SuggestPlace = (input: { lat: number; lng: number }) => Promise<SuggestPlaceResult>

interface Located {
  run: number
  position: { lat: number; lng: number }
  /** Whether the server has been asked about this photo: it is asked once, however the consent is toggled. */
  asked: boolean
}

/**
 * Container logic for the photo's suggested place: reads the GPS of the picked photo in the browser (it never leaves it by
 * itself) and, only once the visitor has consented to keep the place, asks the server to name it and find its street
 * address (the exact position, to the 6 decimals the database keeps). With the consent already on it asks at once; turned
 * on later, then; once per picked photo, and turning it off calls nothing. Each `begin` supersedes the one before, so a
 * slow answer for a photo that is no longer picked is ignored. Failures only mean "no label": nothing blocks saving.
 */
export function usePhotoPlace(parseGps: GpsParser | undefined, suggest: SuggestPlace, consent: boolean) {
  const [place, setPlace] = useState<PhotoPlace>({ status: "idle" })
  const run = useRef(0)
  const located = useRef<Located | null>(null)
  const consented = useRef(consent)

  useEffect(
    () => () => {
      run.current += 1
    },
    [],
  )

  const nameIfDue = useCallback(async () => {
    const mine = located.current
    if (!mine || mine.asked || mine.run !== run.current) return
    mine.asked = true
    const { position } = mine
    setPlace({ status: "found", ...position, label: null, address: null, naming: true, awaitingConsent: false })
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
    if (mine.run !== run.current) return
    setPlace({ status: "found", ...position, label, address, naming: false, awaitingConsent: false })
  }, [suggest])

  useEffect(() => {
    consented.current = consent
    if (consent) void nameIfDue()
  }, [consent, nameIfDue])

  const begin = useCallback(
    async (file: Blob) => {
      const mine = ++run.current
      located.current = null
      setPlace({ status: "reading" })
      const position = await readPhotoGps(file, parseGps)
      if (mine !== run.current) return
      if (!position) return setPlace({ status: "none" })

      located.current = { run: mine, position, asked: false }
      setPlace({ status: "found", ...position, label: null, address: null, naming: false, awaitingConsent: true })
      if (consented.current) await nameIfDue()
    },
    [parseGps, nameIfDue],
  )

  const reset = useCallback(() => {
    run.current += 1
    located.current = null
    setPlace({ status: "idle" })
  }, [])

  return { place, begin, reset }
}
