"use client"

import { useSyncExternalStore } from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(notify: () => void) {
  const mq = typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null
  mq?.addEventListener("change", notify)
  return () => mq?.removeEventListener("change", notify)
}

const snapshot = () => typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches

/** The visitor's reduced-motion preference, live. The server (and the first hydration pass) render the full-motion version. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
