import { isValidHandle, normalizeHandle } from "./handle"

export type GateStatus = "idle" | "invalid" | "checking" | "denied" | "requested" | "granted"

export interface GateState {
  status: GateStatus
  handle: string
}

export type GateEvent =
  | { type: "typed"; raw: string }
  | { type: "submit" }
  | { type: "resolved"; result: "granted" | "denied" }
  | { type: "requestInvite" }

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
      return state.status === "denied" ? { ...state, status: "requested" } : state
  }
}
