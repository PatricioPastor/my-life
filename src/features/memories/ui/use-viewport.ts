"use client"

import { useSyncExternalStore } from "react"

function subscribe(notify: () => void) {
  window.addEventListener("resize", notify)
  return () => window.removeEventListener("resize", notify)
}
// A string, so the snapshot is stable between reads while the size is.
const snapshot = () => `${window.innerWidth}x${window.innerHeight}`
// Before hydration there is no window; desktop is the safe guess (the place only mounts after the portal).
const SERVER_SNAPSHOT = "1280x800"

/** The viewport size in CSS px, live. */
export function useViewport(): { width: number; height: number } {
  const [width, height] = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT).split("x").map(Number)
  return { width, height }
}
