"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ResolveMapsLinkResult } from "../place/resolve-maps-link"
import { PLACE_COPY } from "./place-model"

export type ResolveLink = (input: { url: string }) => Promise<ResolveMapsLinkResult>

/** What the form knows about the Google Maps link the visitor pasted. Positions are already rounded by the server. */
export type MapsLinkState =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "ok"; lat: number; lng: number; label: string | null }
  | { status: "error"; message: string }

/**
 * Container logic for the pasted link: waits for the typing to pause, asks the server to resolve it (full and short
 * links alike) and keeps only the answer for the latest text. A link that resolves is the visitor's way of
 * choosing the place, so `onResolved` lets the form take that as consent. Any failure is a message, never a throw.
 */
export function useMapsLink(resolve: ResolveLink, debounceMs: number, onResolved: () => void) {
  const [text, setText] = useState("")
  const [state, setState] = useState<MapsLinkState>({ status: "idle" })
  const run = useRef(0)
  const timer = useRef<number | undefined>(undefined)

  useEffect(
    () => () => {
      run.current += 1
      window.clearTimeout(timer.current)
    },
    [],
  )

  const reset = useCallback(() => {
    run.current += 1
    window.clearTimeout(timer.current)
    setText("")
    setState({ status: "idle" })
  }, [])

  const change = useCallback(
    (next: string) => {
      const mine = ++run.current
      window.clearTimeout(timer.current)
      setText(next)
      const url = next.trim()
      if (!url) return setState({ status: "idle" })

      // From the first keystroke, so the form never saves a link that has not been read yet.
      setState({ status: "resolving" })
      timer.current = window.setTimeout(async () => {
        let answer: ResolveMapsLinkResult | null = null
        try {
          answer = await resolve({ url })
        } catch {
          // Reported below as an unreadable link.
        }
        if (mine !== run.current) return
        if (answer?.ok) {
          setState({ status: "ok", lat: answer.lat, lng: answer.lng, label: answer.label })
          onResolved()
        } else {
          setState({
            status: "error",
            message: answer?.reason === "not_maps_link" ? PLACE_COPY.linkNotMaps : PLACE_COPY.linkUnreadable,
          })
        }
      }, debounceMs)
    },
    [resolve, debounceMs, onResolved],
  )

  return { text, state, change, reset }
}
