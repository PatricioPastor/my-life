"use client"

import { useSyncExternalStore } from "react"
import { keyboardInset } from "./keyboard-inset"

function subscribe(notify: () => void) {
  const visual = window.visualViewport
  visual?.addEventListener("resize", notify)
  visual?.addEventListener("scroll", notify)
  window.addEventListener("resize", notify)
  return () => {
    visual?.removeEventListener("resize", notify)
    visual?.removeEventListener("scroll", notify)
    window.removeEventListener("resize", notify)
  }
}

const snapshot = () => {
  const visual = window.visualViewport
  return visual ? keyboardInset(window.innerHeight, visual) : 0
}

/** The height of the virtual keyboard over the page, in CSS px (0 when there is none), live. */
export function useKeyboardInset(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0)
}
