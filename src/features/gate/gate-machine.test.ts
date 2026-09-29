import { describe, expect, it } from "vitest"
import { gateReducer, initialGateState, type GateState } from "./gate-machine"

const at = (status: GateState["status"], handle = "ana"): GateState => ({ status, handle })

describe("gateReducer: typing", () => {
  it("normalizes the handle and returns to idle from invalid", () => {
    expect(gateReducer(at("invalid", "a!"), { type: "typed", raw: "@Ana" })).toEqual(at("idle", "ana"))
  })

  it("returns to idle from denied and requested", () => {
    expect(gateReducer(at("denied"), { type: "typed", raw: "ana2" }).status).toBe("idle")
    expect(gateReducer(at("requested"), { type: "typed", raw: "ana2" }).status).toBe("idle")
  })

  it("keeps checking and granted while updating the handle", () => {
    expect(gateReducer(at("checking"), { type: "typed", raw: "x" })).toEqual(at("checking", "x"))
    expect(gateReducer(at("granted"), { type: "typed", raw: "x" })).toEqual(at("granted", "x"))
  })
})

describe("gateReducer: submit", () => {
  it("is a no-op when the handle is empty", () => {
    const s = at("idle", "")
    expect(gateReducer(s, { type: "submit" })).toBe(s)
  })

  it("is a no-op while checking or granted", () => {
    const c = at("checking")
    const g = at("granted")
    expect(gateReducer(c, { type: "submit" })).toBe(c)
    expect(gateReducer(g, { type: "submit" })).toBe(g)
  })

  it("becomes invalid for a malformed handle", () => {
    expect(gateReducer(at("idle", "a-b"), { type: "submit" }).status).toBe("invalid")
  })

  it("becomes checking for a valid handle", () => {
    expect(gateReducer(at("idle"), { type: "submit" }).status).toBe("checking")
    expect(gateReducer(at("denied"), { type: "submit" }).status).toBe("checking")
  })
})

describe("gateReducer: resolve", () => {
  it("moves checking to granted or denied", () => {
    expect(gateReducer(at("checking"), { type: "resolved", result: "granted" }).status).toBe("granted")
    expect(gateReducer(at("checking"), { type: "resolved", result: "denied" }).status).toBe("denied")
  })

  it("ignores a late answer outside checking", () => {
    const s = at("idle")
    expect(gateReducer(s, { type: "resolved", result: "granted" })).toBe(s)
  })
})

describe("gateReducer: request invite", () => {
  it("moves denied to requested", () => {
    expect(gateReducer(at("denied"), { type: "requestInvite" }).status).toBe("requested")
  })

  it("is a no-op elsewhere", () => {
    const s = at("idle")
    expect(gateReducer(s, { type: "requestInvite" })).toBe(s)
  })
})

describe("initialGateState", () => {
  it("starts idle and empty", () => {
    expect(initialGateState).toEqual({ status: "idle", handle: "" })
  })
})
