import type { CursorTarget } from "./magnetic-cursor"

/** How long the reticle must stay on a star before the hint appears. */
export const DWELL_MS = 500

export type ContextPhase = "hidden" | "hint" | "expanded"

export interface ContextState {
  phase: ContextPhase
  /** The last star that carried context; kept after release so the panel can fade out with its text. */
  target: CursorTarget | null
  /** Whether a star with context is captured right now. */
  live: boolean
  ctrl: boolean
  dwellStart: number
}

export type ContextEvent =
  | { type: "capture"; target: CursorTarget | null; now: number }
  | { type: "ctrl"; down: boolean; now: number }
  | { type: "blur"; now: number }
  | { type: "tick"; now: number }

export const initialContextState: ContextState = { phase: "hidden", target: null, live: false, ctrl: false, dwellStart: 0 }

const keyOf = (t: CursorTarget | null) => (t ? (t.id ?? t.label) : null)

/** hidden -> hint (after the dwell) -> expanded (while Ctrl is held) -> hint -> hidden (on release). */
export function contextReducer(state: ContextState, event: ContextEvent): ContextState {
  switch (event.type) {
    case "capture": {
      const t = event.target?.context ? event.target : null
      if (!t) return state.live || state.phase !== "hidden" ? { ...state, live: false, phase: "hidden" } : state
      if (state.live && keyOf(state.target) === keyOf(t)) return state
      // Moving between stars while the panel is up keeps it up and just retargets the text.
      if (state.live && state.phase !== "hidden") return { ...state, target: t }
      return { ...state, target: t, live: true, dwellStart: event.now, phase: state.ctrl ? "expanded" : "hidden" }
    }
    case "ctrl":
      if (event.down) return { ...state, ctrl: true, phase: state.live ? "expanded" : state.phase }
      return { ...state, ctrl: false, phase: state.phase === "expanded" ? "hint" : state.phase }
    case "blur":
      return { ...state, ctrl: false, phase: state.phase === "expanded" ? "hint" : state.phase }
    case "tick":
      return state.live && state.phase === "hidden" && event.now - state.dwellStart >= DWELL_MS
        ? { ...state, phase: "hint" }
        : state
  }
}

/** When the reducer next needs a `tick`, or null when nothing is pending. */
export function nextDeadline(state: ContextState): number | null {
  return state.live && state.phase === "hidden" ? state.dwellStart + DWELL_MS : null
}
