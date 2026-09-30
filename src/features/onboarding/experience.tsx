"use client"

import { useEffect, useState } from "react"
import { Journey } from "@/features/journey"
import { Onboarding } from "./onboarding"
import { useOnboarding } from "./use-onboarding"

// How long the layer takes to fade once the onboarding is done, before it leaves the DOM.
const LEAVE_MS = 900

/** The journey (gate first) with the onboarding layered above it until it is done. */
export function Experience() {
  const [state, dispatch] = useOnboarding()
  const [gone, setGone] = useState(false)
  const done = state.phase === "done"

  useEffect(() => {
    if (!done) return
    const id = setTimeout(() => setGone(true), LEAVE_MS)
    return () => clearTimeout(id)
  }, [done])

  return (
    <>
      <Journey />
      {!gone && <Onboarding state={state} dispatch={dispatch} />}
    </>
  )
}
