"use client"

import { useSyncExternalStore } from "react"

function subscribe(notify: () => void) {
  window.addEventListener("resize", notify)
  return () => window.removeEventListener("resize", notify)
}
// A string, so the snapshot is stable between reads while the size is. The ratio changes with the browser zoom,
// which also fires "resize".
const snapshot = () => `${window.innerWidth}x${window.innerHeight}x${window.devicePixelRatio || 1}`
// Before hydration there is no window; desktop is the safe guess (the place only mounts after the portal).
const SERVER_SNAPSHOT = "1280x800x1"

/** The viewport size in CSS px and the device pixel ratio, live. */
export function useViewport(): { width: number; height: number; dpr: number } {
  const [width, height, dpr] = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT).split("x").map(Number)
  return { width, height, dpr }
}
