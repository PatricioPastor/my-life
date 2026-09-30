"use client"

import { useEffect, useReducer } from "react"
import { FONT_WAIT_MS, fontReadyOrTimeout, loadGambarino } from "./font"
import { greetingFor } from "./greeting"
import { HOLD_MS, dueIn, initialOnboarding, onboardingReducer } from "./onboarding-machine"
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
      dispatch({ type: "start", now: performance.now(), returning: readSeen(), greeting: greetingFor(new Date()) })
    })
    return () => {
      cancelled = true
    }
  }, [phase])

  useEffect(() => {
    const wait = dueIn(state, performance.now())
    if (wait === null) return
    // Timers can fire a hair early; never let that stall the phase.
    const id = setTimeout(
      () => dispatch({ type: "tick", now: Math.max(performance.now(), state.enteredAt + HOLD_MS) }),
      wait,
    )
    return () => clearTimeout(id)
  }, [state])

  useEffect(() => {
    if (phase === "done") markSeen()
  }, [phase])

  return [state, dispatch] as const
}
