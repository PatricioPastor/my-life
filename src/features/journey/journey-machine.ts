/**
 * `orbWarp` is the portal trip from the sky to the memories space, `memories` where it lands, and `orbReturn`
 * the (faster) trip back to the sky.
 */
export type Screen = "gate" | "sky" | "place" | "entry" | "orbWarp" | "memories" | "orbReturn"

/**
 * `story` is the whole journey behind the gate. `work` is the public galaxy at /trabajo: no gate, no memories, and only
 * Proyectos lit.
 */
export type JourneyMode = "story" | "work"

/** A point of the sky in 0..1 stage fractions, y up (the same space as the facet stars). */
export interface SkyPoint {
  x: number
  y: number
}

export interface JourneyState {
  screen: Screen
  facetId: string | undefined
  /** Where the memory orb was when it was opened; the sky dives toward it, like toward a facet star. */
  orbOrigin: SkyPoint | undefined
  entryIndex: number
  page: number
  hoveredFacet: string | null
}

export type JourneyEvent =
  | { type: "gateOpened" }
  | { type: "facetOpened"; facetId: string }
  | { type: "entryOpened"; index: number }
  | ({ type: "orbOpened" } & SkyPoint)
  | { type: "orbArrived" }
  | { type: "orbReturned" }
  | { type: "back" }
  | { type: "nextPage"; pageCount: number }
  | { type: "prevPage" }
  | { type: "hover"; facetId: string | null }

export const initialJourneyState: JourneyState = {
  screen: "gate",
  facetId: undefined,
  orbOrigin: undefined,
  entryIndex: 0,
  page: 0,
  hoveredFacet: null,
}

/**
 * Where a journey starts. The story waits at the gate. The work opens on the sky, or, for a deep link, straight on that
 * case study inside Proyectos, so Back walks out through the list to the sky. A negative index means no case study.
 */
export function initialJourneyStateFor(mode: JourneyMode, entryIndex?: number): JourneyState {
  if (mode === "story") return initialJourneyState
  if (entryIndex === undefined || entryIndex < 0) return { ...initialJourneyState, screen: "sky" }
  return { ...initialJourneyState, screen: "entry", facetId: "projects", entryIndex, page: 0 }
}

export function journeyReducer(state: JourneyState, event: JourneyEvent): JourneyState {
  switch (event.type) {
    case "gateOpened":
      return state.screen === "gate" ? { ...state, screen: "sky" } : state
    case "facetOpened":
      return state.screen === "sky"
        ? { ...state, screen: "place", facetId: event.facetId, orbOrigin: undefined, hoveredFacet: null }
        : state
    case "orbOpened":
      return state.screen === "sky"
        ? { ...state, screen: "orbWarp", orbOrigin: { x: event.x, y: event.y }, hoveredFacet: null }
        : state
    case "orbArrived":
      return state.screen === "orbWarp" ? { ...state, screen: "memories" } : state
    case "orbReturned":
      return state.screen === "orbReturn" ? { ...state, screen: "sky" } : state
    case "entryOpened":
      return state.screen === "place" ? { ...state, screen: "entry", entryIndex: event.index, page: 0 } : state
    case "back":
      if (state.screen === "entry") return { ...state, screen: "place" }
      // The memories space leaves through the portal; a facet's place goes straight back to the sky.
      if (state.screen === "memories") return { ...state, screen: "orbReturn" }
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
const ZOOM: Record<Screen, number> = {
  gate: 1.35, sky: 1, place: 1.45, entry: 2.1, orbWarp: 1.3, memories: 1.7, orbReturn: 1.3,
}
const VEIL: Record<Screen, number> = {
  gate: 0, sky: 0, place: 0.5, entry: 0.86, orbWarp: 0.3, memories: 0.72, orbReturn: 0.3,
}

/**
 * Whether the sky can idle (skip painting): behind the gate, and while the memories void fully covers it.
 * Under the orb's portals it keeps painting: the way in flies out of it, and the way back must find it already
 * painting when the tunnel fades, so it wakes the moment the way back starts.
 */
export const skyPausedFor = (screen: Screen): boolean => screen === "gate" || screen === "memories"

export const zoomFor = (screen: Screen): number => ZOOM[screen]
export const veilFor = (screen: Screen): number => VEIL[screen]

/** Zoom origin in %: the sky's centre until a star is chosen, then that star (y flipped to CSS). */
export function originFor(facet: { x: number; y: number } | undefined): { x: number; y: number } {
  if (!facet) return { x: 50, y: 50 }
  return { x: Number((facet.x * 100).toFixed(2)), y: Number(((1 - facet.y) * 100).toFixed(2)) }
}

/** Where the sky dives: toward the orb after its portal (and back out of it), otherwise toward the facet last opened. */
export function journeyOriginFor(
  state: Pick<JourneyState, "orbOrigin">,
  facet: { x: number; y: number } | undefined,
): { x: number; y: number } {
  return originFor(state.orbOrigin ?? facet)
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
