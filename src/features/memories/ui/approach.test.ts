import { describe, expect, it } from "vitest"
import type { MemoryView } from "../memory-view"
import { IDLE, moveMode, neighborOf, orderByDate, reduceApproach, type Approach } from "./approach"
import type { Camera } from "./camera"

const back: Camera = { x: 800, y: 500, zoom: 0.9 }

const memory = (id: string, happenedOn: string, over: Partial<MemoryView> = {}): MemoryView => ({
  id,
  caption: id,
  happenedOn,
  status: "approved",
  width: 10,
  height: 10,
  kind: "image",
  takenAt: null,
  dominantColor: null,
  place: null,
  orbColor: "#8ab4ff",
  viewCount: 0,

  relatedId: null,
  thumbUrl: null,
  fullUrl: null,
  audio: null,
  ...over,
})

describe("the approach state machine", () => {
  it("starts idle", () => {
    expect(IDLE).toEqual({ phase: "idle" })
  })

  it("flies to an orb when it is activated, remembering where the camera was", () => {
    expect(reduceApproach(IDLE, { type: "activate", id: "a", camera: back })).toEqual({ phase: "flying", id: "a", back })
  })

  it("opens the glass once it arrives", () => {
    const flying: Approach = { phase: "flying", id: "a", back }
    expect(reduceApproach(flying, { type: "arrived" })).toEqual({ phase: "open", id: "a", back })
  })

  it("flies back when closed, from the glass or mid-flight, and is idle again once it has landed", () => {
    const open: Approach = { phase: "open", id: "a", back }
    const leaving = reduceApproach(open, { type: "close" })
    expect(leaving).toEqual({ phase: "leaving", id: "a", back })
    expect(reduceApproach({ phase: "flying", id: "a", back }, { type: "close" })).toEqual(leaving)
    expect(reduceApproach(leaving, { type: "left" })).toEqual(IDLE)
  })

  it("switches to another memory from the glass without closing it, keeping the camera to return to", () => {
    const open: Approach = { phase: "open", id: "a", back }
    expect(reduceApproach(open, { type: "step", id: "b" })).toEqual({ phase: "switching", id: "b", back })
  })

  it("retargets a switch on the way: one motion, aimed at the latest memory", () => {
    const switching: Approach = { phase: "switching", id: "b", back }
    expect(reduceApproach(switching, { type: "step", id: "c" })).toEqual({ phase: "switching", id: "c", back })
    expect(reduceApproach(switching, { type: "step", id: "b" })).toBe(switching)
  })

  it("opens on the new memory when the switch lands, and can be closed on the way", () => {
    const switching: Approach = { phase: "switching", id: "b", back }
    expect(reduceApproach(switching, { type: "arrived" })).toEqual({ phase: "open", id: "b", back })
    expect(reduceApproach(switching, { type: "close" })).toEqual({ phase: "leaving", id: "b", back })
    expect(reduceApproach(switching, { type: "activate", id: "z", camera: back })).toBe(switching)
  })

  it("retargets the first flight too, before the glass has opened", () => {
    expect(reduceApproach({ phase: "flying", id: "b", back }, { type: "step", id: "c" })).toEqual({
      phase: "flying",
      id: "c",
      back,
    })
  })

  it("lets an orb be activated again while it is still flying back, returning to the original view", () => {
    const leaving: Approach = { phase: "leaving", id: "a", back }
    const elsewhere: Camera = { x: 1, y: 2, zoom: 1 }
    expect(reduceApproach(leaving, { type: "activate", id: "b", camera: elsewhere })).toEqual({
      phase: "flying",
      id: "b",
      back,
    })
  })

  it("ignores events that make no sense in the current phase", () => {
    expect(reduceApproach(IDLE, { type: "close" })).toBe(IDLE)
    expect(reduceApproach(IDLE, { type: "arrived" })).toBe(IDLE)
    expect(reduceApproach(IDLE, { type: "left" })).toBe(IDLE)
    expect(reduceApproach(IDLE, { type: "step", id: "a" })).toBe(IDLE)
    const open: Approach = { phase: "open", id: "a", back }
    expect(reduceApproach(open, { type: "activate", id: "b", camera: back })).toBe(open)
    expect(reduceApproach(open, { type: "arrived" })).toBe(open)
    const leaving: Approach = { phase: "leaving", id: "a", back }
    expect(reduceApproach(leaving, { type: "arrived" })).toBe(leaving)
  })
})

describe("date order", () => {
  const list = [
    memory("c", "2024-05-01"),
    memory("a", "2023-01-10"),
    memory("b2", "2024-01-01", { takenAt: "2024-01-01T18:00:00Z" }),
    memory("b1", "2024-01-01", { takenAt: "2024-01-01T09:00:00Z" }),
    memory("b0", "2024-01-01"),
  ]

  it("sorts by the day it happened, then by when the photo was taken, then by id", () => {
    expect(orderByDate(list).map((m) => m.id)).toEqual(["a", "b1", "b2", "b0", "c"])
  })

  it("does not change the list it is given", () => {
    const copy = [...list]
    orderByDate(list)
    expect(list).toEqual(copy)
  })

  it("finds the previous and next memory, and stops at the ends", () => {
    const ordered = orderByDate(list)
    expect(neighborOf(ordered, "b1", 1)?.id).toBe("b2")
    expect(neighborOf(ordered, "b1", -1)?.id).toBe("a")
    expect(neighborOf(ordered, "a", -1)).toBeNull()
    expect(neighborOf(ordered, "c", 1)).toBeNull()
    expect(neighborOf(ordered, "nope", 1)).toBeNull()
  })
})

describe("how the camera moves", () => {
  it("flies by default", () => {
    expect(moveMode(false)).toBe("fly")
  })

  it("cuts with a short fade under reduced motion", () => {
    expect(moveMode(true)).toBe("cut")
  })
})
