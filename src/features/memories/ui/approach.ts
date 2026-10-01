import type { MemoryView } from "../memory-view"
import type { Camera } from "./camera"

/**
 * Opening a memory is an approach, not a zoom: the camera flies to the orb, the orb opens into the glass view, and
 * closing flies back to where the camera was. This is that state machine, pure; the component runs the flights.
 */
export type Approach =
  | { phase: "idle" }
  /** Flying to an orb. `back` is the camera to return to, taken when the first orb was activated. */
  | { phase: "flying"; id: string; back: Camera }
  | { phase: "open"; id: string; back: Camera }
  /** Flying back to `back`. */
  | { phase: "leaving"; id: string; back: Camera }

export type ApproachEvent =
  | { type: "activate"; id: string; camera: Camera }
  | { type: "arrived" }
  | { type: "close" }
  | { type: "left" }
  | { type: "step"; id: string }

export const IDLE: Approach = { phase: "idle" }

export function reduceApproach(state: Approach, event: ApproachEvent): Approach {
  switch (event.type) {
    case "activate":
      if (state.phase === "idle") return { phase: "flying", id: event.id, back: event.camera }
      // An orb tapped while the camera is still on its way back: approach it, and still return to the original view.
      if (state.phase === "leaving") return { phase: "flying", id: event.id, back: state.back }
      return state
    case "arrived":
      return state.phase === "flying" ? { phase: "open", id: state.id, back: state.back } : state
    case "close":
      return state.phase === "flying" || state.phase === "open"
        ? { phase: "leaving", id: state.id, back: state.back }
        : state
    case "left":
      return state.phase === "leaving" ? IDLE : state
    case "step":
      return state.phase === "flying" || state.phase === "open"
        ? { phase: "flying", id: event.id, back: state.back }
        : state
  }
}

const dateKey = (m: MemoryView) => m.happenedOn

/** Date order: the day it happened, then when the photo was taken (memories without a time last), then the id. */
export function orderByDate(memories: readonly MemoryView[]): MemoryView[] {
  return [...memories].sort((a, b) => {
    if (dateKey(a) !== dateKey(b)) return dateKey(a) < dateKey(b) ? -1 : 1
    if (a.takenAt !== b.takenAt) {
      if (a.takenAt === null) return 1
      if (b.takenAt === null) return -1
      return a.takenAt < b.takenAt ? -1 : 1
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/** The memory before (`-1`) or after (`1`) this one in an ordered list, or null at either end. */
export function neighborOf(ordered: readonly MemoryView[], id: string, direction: -1 | 1): MemoryView | null {
  const index = ordered.findIndex((m) => m.id === id)
  if (index < 0) return null
  return ordered[index + direction] ?? null
}

/** The camera flies, except under reduced motion, where it cuts (with a short fade) and has no inertia. */
export function moveMode(reduced: boolean): "fly" | "cut" {
  return reduced ? "cut" : "fly"
}
