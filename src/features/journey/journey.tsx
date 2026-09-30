"use client"

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { FACET_ANCHORS, FACETS, FacetPlace, FacetStars, findFacet } from "@/features/facets"
import { checkHandle } from "@/features/gate/actions"
import { GateScreen, gateReducer, initialGateState } from "@/features/gate"
import { READER_PAGES, Reader } from "@/features/reader"
import { HalftoneSky, resolveSkyParams, type HalftoneSkyHandle, type SkyPresetName } from "@/features/sky"
import { BackButton } from "./back-button"
import {
  initialJourneyState,
  journeyReducer,
  listSideFor,
  originFor,
  veilFor,
  zoomFor,
} from "./journey-machine"
import { themeVars } from "./theme"

// "Checking" is felt, not flashed: it lasts at least this long even if the server answers sooner.
const CHECK_MIN_MS = 1100
// The warp before the tunnel's mouth opens onto the sky, and how long the gate layer lingers after.
const WARP_MS = 1500
const GATE_EXIT_MS = 1300

const SHADOW = "[text-shadow:0_1px_10px_rgba(0,0,0,0.9)]"

interface JourneyProps {
  preset?: SkyPresetName
}

export function Journey({ preset = "ember" }: JourneyProps) {
  const [gate, dispatchGate] = useReducer(gateReducer, initialGateState)
  const [journey, dispatch] = useReducer(journeyReducer, initialJourneyState)
  const [gateMounted, setGateMounted] = useState(true)
  const skyRef = useRef<HalftoneSkyHandle>(null)
  const layerRef = useRef<HTMLDivElement>(null)

  const params = useMemo(() => resolveSkyParams(preset), [preset])
  const { screen } = journey
  const facet = findFacet(journey.facetId)
  const gateActive = screen === "gate"

  // Stable, so the sky's render loop never re-subscribes; it moves the label layer without React state.
  const onLayerShift = useCallback((x: number, y: number) => {
    const layer = layerRef.current
    if (layer) layer.style.transform = `translate(${x}px, ${y}px)`
  }, [])

  // Checking: ask the server, and hold for the minimum beat. Failures deny (fail closed).
  useEffect(() => {
    if (gate.status !== "checking") return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const beat = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, CHECK_MIN_MS)
    })
    const answer = checkHandle(gate.handle).catch(() => ({ status: "denied" as const }))
    Promise.all([answer, beat]).then(([result]) => {
      if (!cancelled) dispatchGate({ type: "resolved", result: result.status === "granted" ? "granted" : "denied" })
    })
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [gate.status, gate.handle])

  // Granted: warp, fly through the mouth into the sky, then let the gate layer go.
  useEffect(() => {
    if (gate.status !== "granted") return
    let exit: ReturnType<typeof setTimeout> | undefined
    const warp = setTimeout(() => {
      dispatch({ type: "gateOpened" })
      skyRef.current?.pulse(0.5, 0.5)
      exit = setTimeout(() => setGateMounted(false), GATE_EXIT_MS)
    }, WARP_MS)
    return () => {
      clearTimeout(warp)
      clearTimeout(exit)
    }
  }, [gate.status])

  const origin = originFor(facet)
  const listSide = listSideFor((facet ?? FACETS[0]).x)
  const entry = (facet ?? FACETS[0]).entries[journey.entryIndex] ?? (facet ?? FACETS[0]).entries[0]

  return (
    <main
      className="ui relative h-svh w-full overflow-hidden bg-void font-sans text-ink"
      style={themeVars(params)}
    >
      <div
        className="sky absolute inset-0"
        style={{ transform: `scale(${zoomFor(screen)})`, transformOrigin: `${origin.x}% ${origin.y}%` }}
      >
        <HalftoneSky
          ref={skyRef}
          preset={preset}
          anchors={FACET_ANCHORS}
          hidden={gateActive}
          allowSparkles={screen === "sky"}
          onLayerShift={onLayerShift}
        >
          {screen === "sky" && (
            <FacetStars
              facets={FACETS}
              hovered={journey.hoveredFacet}
              sky={skyRef}
              layerRef={layerRef}
              onHover={(id) => dispatch({ type: "hover", facetId: id })}
              onOpen={(f) => dispatch({ type: "facetOpened", facetId: f.id })}
            />
          )}
        </HalftoneSky>
      </div>

      <div
        className="veil pointer-events-none absolute inset-0 bg-void"
        style={{ opacity: veilFor(screen) }}
      />

      {screen === "sky" && (
        <h1
          className={`rise pointer-events-none absolute top-10 left-12 m-0 text-xs font-normal tracking-[0.12em] text-ink-muted ${SHADOW}`}
        >
          patriciopastor
        </h1>
      )}

      {screen === "place" && facet && (
        <div className="absolute inset-0">
          <BackButton label="Cielo" onClick={() => dispatch({ type: "back" })} />
          <FacetPlace
            facet={facet}
            listSide={listSide}
            onOpenEntry={(index) => dispatch({ type: "entryOpened", index })}
          />
        </div>
      )}

      {screen === "entry" && facet && (
        <div className="absolute inset-0">
          <BackButton label={facet.name} onClick={() => dispatch({ type: "back" })} />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
            <Reader
              meta={entry.meta}
              title={entry.title}
              page={journey.page}
              onPrev={() => dispatch({ type: "prevPage" })}
              onNext={() => dispatch({ type: "nextPage", pageCount: READER_PAGES.length })}
            />
          </div>
        </div>
      )}

      {gateMounted && (
        <div
          className="gate absolute inset-0"
          style={{
            opacity: gateActive ? 1 : 0,
            transform: `scale(${gateActive ? 1 : 1.5})`,
            pointerEvents: gateActive ? "auto" : "none",
          }}
        >
          <GateScreen
            state={gate}
            onTyped={(raw) => dispatchGate({ type: "typed", raw })}
            onSubmit={() => dispatchGate({ type: "submit" })}
            onRequestInvite={(copied) => dispatchGate({ type: "requestInvite", copied })}
          />
        </div>
      )}
    </main>
  )
}
