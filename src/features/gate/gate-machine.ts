import { isValidHandle, normalizeHandle } from "./handle"

export type GateStatus = "idle" | "invalid" | "checking" | "denied" | "requested" | "granted"

export interface GateState {
  status: GateStatus
  handle: string
  /** Only set once requested: whether the DM text made it to the clipboard. */
  copied?: boolean
}

export type GateEvent =
  | { type: "typed"; raw: string }
  | { type: "submit" }
  | { type: "resolved"; result: "granted" | "denied" }
  | { type: "requestInvite"; copied: boolean }

export const initialGateState: GateState = { status: "idle", handle: "" }

export function gateReducer(state: GateState, event: GateEvent): GateState {
  switch (event.type) {
    case "typed": {
      const handle = normalizeHandle(event.raw)
      // Editing clears a refusal, but never interrupts an in-flight check or the granted warp.
      const locked = state.status === "checking" || state.status === "granted"
      return { handle, status: locked ? state.status : "idle" }
    }
    case "submit": {
      if (!state.handle || state.status === "checking" || state.status === "granted") return state
      return { ...state, status: isValidHandle(state.handle) ? "checking" : "invalid" }
    }
    case "resolved":
      return state.status === "checking" ? { ...state, status: event.result } : state
    case "requestInvite":
      // Also from requested: reopening the link re-copies, so the copy result stays truthful.
      return state.status === "denied" || state.status === "requested"
        ? { ...state, status: "requested", copied: event.copied }
        : state
  }
}
