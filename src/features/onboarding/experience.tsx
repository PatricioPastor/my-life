"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { warmUpSky } from "@/features/sky/warm-up"
import { probeRenderer } from "./gpu-probe"
import { whenIdle } from "./idle"
import { track } from "@/shared/analytics"
import type { Story } from "@/shared/content"
import { Onboarding } from "./onboarding"
import { journeyWanted } from "./onboarding-machine"
import { useOnboarding } from "./use-onboarding"

// The heavy client tree (sky, tunnel, cursor, shaders) is its own chunk, fetched while the onboarding plays.
const loadJourney = () => import("@/features/journey").then((m) => m.Journey)
const LazyJourney = dynamic(() => loadJourney(), { ssr: false })

// How long the layer takes to fade once the onboarding is done, before it leaves the DOM.
const LEAVE_MS = 900

/** The journey (gate first) with the onboarding layered above it until it is done. */
export function Experience({ story }: { story: Story }) {
  const [state, dispatch, replay] = useOnboarding()
  const [gone, setGone] = useState(false)
  const { phase } = state
  const done = phase === "done"

  // Fetch the journey chunk as soon as the onboarding is up; it mounts later, when the text is done.
  useEffect(() => whenIdle(() => void loadJourney(), 800), [])

  // Compile the sky program offscreen while the visitor reads, so the real mount is instant.
  useEffect(() => {
    if (phase !== "story") return
    return whenIdle(() => {
      probeRenderer()
      warmUpSky()
    })
  }, [phase])

  useEffect(() => {
    if (!done) return
    const id = setTimeout(() => setGone(true), LEAVE_MS)
    return () => clearTimeout(id)
  }, [done])

  // The journey stays mounted (no WebGL teardown); the onboarding layer just comes back over it. The control is only
  // offered while the intro is done, so it never sits (focusable, magnetic) underneath the layer.
  const replayIntro = () => {
    track("intro_replayed")
    setGone(false)
    replay()
  }

  return (
    <>
      {journeyWanted(state) && <LazyJourney onReplayIntro={done ? replayIntro : undefined} />}
      {!gone && <Onboarding story={story} state={state} dispatch={dispatch} />}
    </>
  )
}
