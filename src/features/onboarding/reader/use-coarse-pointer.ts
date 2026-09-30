"use client"

import { useSyncExternalStore } from "react"

const QUERY = "(pointer: coarse)"

function subscribe(notify: () => void) {
  const mq = typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null
  mq?.addEventListener("change", notify)
  return () => mq?.removeEventListener("change", notify)
}

const snapshot = () => typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches

/** Whether the main pointer is a finger: the hint says "toca" there and "haz clic" with a mouse. Hydrates as a mouse. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
