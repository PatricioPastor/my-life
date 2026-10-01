import { describe, expect, it } from "vitest"
import {
  initialJourneyState,
  journeyReducer,
  focusIndexFor,
  listSideFor,
  originFor,
  journeyOriginFor,
  veilFor,
  zoomFor,
  type JourneyState,
} from "./journey-machine"

const s = (patch: Partial<JourneyState>): JourneyState => ({ ...initialJourneyState, ...patch })

describe("journeyReducer", () => {
  it("starts at the gate", () => {
    expect(initialJourneyState).toEqual({
      screen: "gate",
      facetId: undefined,
      entryIndex: 0,
      page: 0,
      hoveredFacet: null,
    })
  })

  it("opens the sky from the gate only", () => {
    expect(journeyReducer(s({ screen: "gate" }), { type: "gateOpened" }).screen).toBe("sky")
    const place = s({ screen: "place", facetId: "now" })
    expect(journeyReducer(place, { type: "gateOpened" })).toBe(place)
  })

  it("opens a facet from the sky and clears the hover", () => {
    const next = journeyReducer(s({ screen: "sky", hoveredFacet: "now" }), { type: "facetOpened", facetId: "now" })
    expect(next).toMatchObject({ screen: "place", facetId: "now", hoveredFacet: null })
  })

  it("ignores a facet opened outside the sky", () => {
    const gate = s({ screen: "gate" })
    expect(journeyReducer(gate, { type: "facetOpened", facetId: "now" })).toBe(gate)
  })

  it("opens an entry from the place and resets the page", () => {
    const next = journeyReducer(s({ screen: "place", facetId: "now", page: 2 }), { type: "entryOpened", index: 1 })
    expect(next).toMatchObject({ screen: "entry", entryIndex: 1, page: 0 })
  })

  it("ignores an entry opened outside the place", () => {
    const sky = s({ screen: "sky" })
    expect(journeyReducer(sky, { type: "entryOpened", index: 1 })).toBe(sky)
  })

  it("goes back entry to place, then place to sky", () => {
    const entry = s({ screen: "entry", facetId: "now" })
    const place = journeyReducer(entry, { type: "back" })
    expect(place.screen).toBe("place")
    expect(journeyReducer(place, { type: "back" }).screen).toBe("sky")
  })

  it("keeps the chosen facet when going back", () => {
    const back = journeyReducer(s({ screen: "place", facetId: "now" }), { type: "back" })
    expect(back.facetId).toBe("now")
  })

  it("does not go back from the sky or the gate", () => {
    const sky = s({ screen: "sky" })
    const gate = s({ screen: "gate" })
    expect(journeyReducer(sky, { type: "back" })).toBe(sky)
    expect(journeyReducer(gate, { type: "back" })).toBe(gate)
  })

  it("pages forward and back, clamped to the page count", () => {
    const entry = s({ screen: "entry", page: 1 })
    expect(journeyReducer(entry, { type: "nextPage", pageCount: 3 }).page).toBe(2)
    expect(journeyReducer(s({ screen: "entry", page: 2 }), { type: "nextPage", pageCount: 3 }).page).toBe(2)
    expect(journeyReducer(entry, { type: "prevPage" }).page).toBe(0)
    expect(journeyReducer(s({ screen: "entry", page: 0 }), { type: "prevPage" }).page).toBe(0)
  })

  it("tracks the hovered facet", () => {
    expect(journeyReducer(s({ screen: "sky" }), { type: "hover", facetId: "now" }).hoveredFacet).toBe("now")
    expect(journeyReducer(s({ hoveredFacet: "now" }), { type: "hover", facetId: null }).hoveredFacet).toBeNull()
  })
})

describe("memory orb journey", () => {
  const at = { x: 0.62, y: 0.4 }

  it("opens the portal from the sky and remembers where the orb was", () => {
    const next = journeyReducer(s({ screen: "sky", hoveredFacet: "now" }), { type: "orbOpened", ...at })
    expect(next).toMatchObject({ screen: "orbWarp", orbOrigin: at, hoveredFacet: null })
  })

  it("ignores the orb outside the sky", () => {
    for (const screen of ["gate", "place", "entry", "orbWarp", "memories"] as const) {
      const state = s({ screen })
      expect(journeyReducer(state, { type: "orbOpened", ...at })).toBe(state)
    }
  })

  it("lands in the memories space only when the warp ends", () => {
    const warp = s({ screen: "orbWarp", orbOrigin: at })
    expect(journeyReducer(warp, { type: "orbArrived" })).toMatchObject({ screen: "memories", orbOrigin: at })
    const sky = s({ screen: "sky" })
    expect(journeyReducer(sky, { type: "orbArrived" })).toBe(sky)
  })

  it("goes sky, orb warp, memories and back to the sky", () => {
    let state = s({ screen: "sky" })
    state = journeyReducer(state, { type: "orbOpened", ...at })
    expect(state.screen).toBe("orbWarp")
    state = journeyReducer(state, { type: "orbArrived" })
    expect(state.screen).toBe("memories")
    state = journeyReducer(state, { type: "back" })
    expect(state.screen).toBe("sky")
  })

  it("cannot be left through back while the portal is still opening", () => {
    const warp = s({ screen: "orbWarp", orbOrigin: at })
    expect(journeyReducer(warp, { type: "back" })).toBe(warp)
  })

  it("keeps the facet journey intact and forgets the orb when a facet opens", () => {
    const afterOrb = s({ screen: "sky", orbOrigin: at })
    const next = journeyReducer(afterOrb, { type: "facetOpened", facetId: "now" })
    expect(next).toMatchObject({ screen: "place", facetId: "now" })
    expect(next.orbOrigin).toBeUndefined()
  })

  it("dives toward the orb, then toward whichever place was opened last", () => {
    expect(journeyOriginFor(s({ screen: "orbWarp", orbOrigin: at }), undefined)).toEqual({ x: 62, y: 60 })
    expect(journeyOriginFor(s({ screen: "place", facetId: "now" }), { x: 0.39, y: 0.29 })).toEqual({ x: 39, y: 71 })
    expect(journeyOriginFor(s({ screen: "sky" }), undefined)).toEqual({ x: 50, y: 50 })
  })

  it("zooms and veils the portal and the memories space", () => {
    expect(zoomFor("orbWarp")).toBeGreaterThan(zoomFor("sky"))
    expect(zoomFor("memories")).toBeGreaterThan(zoomFor("orbWarp"))
    expect(veilFor("orbWarp")).toBeGreaterThan(0)
    expect(veilFor("memories")).toBeGreaterThan(veilFor("place"))
    expect(veilFor("memories")).toBeLessThan(1)
  })

  it("never spotlights a facet star outside the sky", () => {
    expect(focusIndexFor("orbWarp", "projects", "now", ["stories", "writing", "projects", "now"])).toBe(-1)
    expect(focusIndexFor("memories", "projects", "now", ["stories", "writing", "projects", "now"])).toBe(-1)
  })
})

describe("derived values", () => {
  it("zooms per screen", () => {
    expect(zoomFor("gate")).toBe(1.35)
    expect(zoomFor("sky")).toBe(1)
    expect(zoomFor("place")).toBe(1.45)
    expect(zoomFor("entry")).toBe(2.1)
  })

  it("dives toward the chosen facet, flipping y", () => {
    expect(originFor(undefined)).toEqual({ x: 50, y: 50 })
    expect(originFor({ x: 0.21, y: 0.68 })).toEqual({ x: 21, y: 32 })
  })

  it("veils the place and entry screens", () => {
    expect(veilFor("gate")).toBe(0)
    expect(veilFor("sky")).toBe(0)
    expect(veilFor("place")).toBe(0.5)
    expect(veilFor("entry")).toBe(0.86)
  })

  it("focuses the star the cursor captured, else the one hovered or keyboard-focused, only on the sky", () => {
    const ids = ["stories", "writing", "projects", "now"]
    expect(focusIndexFor("sky", "projects", null, ids)).toBe(2)
    expect(focusIndexFor("sky", null, "now", ids)).toBe(3)
    expect(focusIndexFor("sky", "writing", "now", ids)).toBe(1)
    expect(focusIndexFor("sky", null, null, ids)).toBe(-1)
    expect(focusIndexFor("sky", "nope", null, ids)).toBe(-1)
    expect(focusIndexFor("place", "projects", "now", ids)).toBe(-1)
    expect(focusIndexFor("gate", "projects", null, ids)).toBe(-1)
  })

  it("puts the list on the side opposite the star", () => {
    expect(listSideFor(0.75)).toBe("left")
    expect(listSideFor(0.5)).toBe("right")
    expect(listSideFor(0.21)).toBe("right")
  })
})
