"use client"

import { useEffect, useReducer } from "react"
import { FONT_WAIT_MS, fontReadyOrTimeout, loadGambarino } from "./font"
import { greetingFor } from "./greeting"
import { dueIn, initialOnboarding, onboardingReducer } from "./onboarding-machine"
import { phaseDurations } from "./phrases"
import { markSeen, readSeen } from "./onboarding-storage"

/** Drives the onboarding machine: starts it after mount (so SSR stays neutral) and schedules its timed steps. */
export function useOnboarding() {
  const [state, dispatch] = useReducer(onboardingReducer, initialOnboarding)
  const { phase } = state

  useEffect(() => {
    if (phase !== "idle") return
    // The first phrase waits (up to a cap) for Gambarino, so it never swaps faces mid-fade.
    let cancelled = false
    void fontReadyOrTimeout(loadGambarino, FONT_WAIT_MS).then(() => {
      if (cancelled) return
      const returning = readSeen()
      const greeting = greetingFor(new Date())
      dispatch({ type: "start", now: performance.now(), returning, greeting, durations: phaseDurations(greeting, returning) })
    })
    return () => {
      cancelled = true
    }
  }, [phase])

  useEffect(() => {
    const armedAt = performance.now()
    const wait = dueIn(state, armedAt)
    if (wait === null) return
    // Timers can fire a hair early; never let that stall the phase.
    const id = setTimeout(() => dispatch({ type: "tick", now: Math.max(performance.now(), armedAt + wait) }), wait)
    return () => clearTimeout(id)
  }, [state])

  useEffect(() => {
    if (phase === "done") markSeen()
  }, [phase])

  return [state, dispatch] as const
}
