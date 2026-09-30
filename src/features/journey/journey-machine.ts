export type Screen = "gate" | "sky" | "place" | "entry"

export interface JourneyState {
  screen: Screen
  facetId: string | undefined
  entryIndex: number
  page: number
  hoveredFacet: string | null
}

export type JourneyEvent =
  | { type: "gateOpened" }
  | { type: "facetOpened"; facetId: string }
  | { type: "entryOpened"; index: number }
  | { type: "back" }
  | { type: "nextPage"; pageCount: number }
  | { type: "prevPage" }
  | { type: "hover"; facetId: string | null }

export const initialJourneyState: JourneyState = {
  screen: "gate",
  facetId: undefined,
  entryIndex: 0,
  page: 0,
  hoveredFacet: null,
}

export function journeyReducer(state: JourneyState, event: JourneyEvent): JourneyState {
  switch (event.type) {
    case "gateOpened":
      return state.screen === "gate" ? { ...state, screen: "sky" } : state
    case "facetOpened":
      return state.screen === "sky"
        ? { ...state, screen: "place", facetId: event.facetId, hoveredFacet: null }
        : state
    case "entryOpened":
      return state.screen === "place" ? { ...state, screen: "entry", entryIndex: event.index, page: 0 } : state
    case "back":
      if (state.screen === "entry") return { ...state, screen: "place" }
      if (state.screen === "place") return { ...state, screen: "sky" }
      return state
    case "nextPage":
      return { ...state, page: Math.min(event.pageCount - 1, state.page + 1) }
    case "prevPage":
      return { ...state, page: Math.max(0, state.page - 1) }
    case "hover":
      return { ...state, hoveredFacet: event.facetId }
  }
}

// Behind the gate the sky waits zoomed in; arriving eases it back to rest.
const ZOOM: Record<Screen, number> = { gate: 1.35, sky: 1, place: 1.45, entry: 2.1 }
const VEIL: Record<Screen, number> = { gate: 0, sky: 0, place: 0.5, entry: 0.86 }

export const zoomFor = (screen: Screen): number => ZOOM[screen]
export const veilFor = (screen: Screen): number => VEIL[screen]

/** Zoom origin in %: the sky's centre until a star is chosen, then that star (y flipped to CSS). */
export function originFor(facet: { x: number; y: number } | undefined): { x: number; y: number } {
  if (!facet) return { x: 50, y: 50 }
  return { x: Number((facet.x * 100).toFixed(2)), y: Number(((1 - facet.y) * 100).toFixed(2)) }
}

/** Which sky anchor to spotlight: the star the cursor captured, else the hovered or keyboard-focused one; -1 for none. */
export function focusIndexFor(
  screen: Screen,
  capturedId: string | null,
  hoveredId: string | null,
  facetIds: readonly string[],
): number {
  if (screen !== "sky") return -1
  return facetIds.indexOf(capturedId ?? hoveredId ?? "")
}

/** The list opens on the side of the sky away from the star you dove into. */
export function listSideFor(facetX: number): "left" | "right" {
  return facetX > 0.5 ? "left" : "right"
}
