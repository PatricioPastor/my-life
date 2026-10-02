"use client"

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { FACET_ANCHORS, FACETS, FacetPlace, FacetStars, findFacet } from "@/features/facets"
import { checkHandle } from "@/features/gate/actions"
import { ContextPanel, MagneticCursor, type CursorTarget } from "@/features/cursor"
import { AsciiTunnel, GateScreen, gateReducer, initialGateState } from "@/features/gate"
import { MemoriesSpace } from "@/features/memories"
import { useReducedMotion } from "@/features/onboarding/reader/use-reduced-motion"
import { ORB_CURSOR_ID, ORB_PORTAL, Orb } from "@/features/orb"
import { READER_PAGES, Reader } from "@/features/reader"
import { HalftoneSky, resolveSkyParams, type HalftoneSkyHandle, type SkyPresetName } from "@/features/sky"
import { track } from "@/shared/analytics"
import { BackButton } from "./back-button"
import { ReplayIntroButton } from "./replay-intro-button"
import {
  focusIndexFor,
  initialJourneyState,
  journeyOriginFor,
  journeyReducer,
  listSideFor,
  skyPausedFor,
  veilFor,
  zoomFor,
} from "./journey-machine"
import { PARALLAX_REST, stepParallax, type ParallaxState } from "./parallax"
import {
  ORB_EXIT_MS,
  ORB_RETURN_EXIT_MS,
  ORB_RETURN_FADE_MS,
  ORB_RETURN_MS,
  ORB_RETURN_REDUCED_MS,
  ORB_WARP_MS,
} from "./portal-timing"
import { skyKeepOut } from "./sky-keep-out"
import { themeVars } from "./theme"

// "Checking" is felt, not flashed: it lasts at least this long even if the server answers sooner.
const CHECK_MIN_MS = 1100
// The warp before the tunnel's mouth opens onto the sky, and how long the gate layer lingers after.
const WARP_MS = 1500
const GATE_EXIT_MS = 1300

const FACET_IDS = FACETS.map((f) => f.id)

const SHADOW = "[text-shadow:0_1px_10px_rgba(0,0,0,0.9)]"

interface JourneyProps {
  preset?: SkyPresetName
  /** Plays the onboarding again over this journey. The control only shows when given. */
  onReplayIntro?: () => void
}

export function Journey({ preset = "ember", onReplayIntro }: JourneyProps) {
  const [gate, dispatchGate] = useReducer(gateReducer, initialGateState)
  const [journey, dispatch] = useReducer(journeyReducer, initialJourneyState)
  const [gateMounted, setGateMounted] = useState(true)
  // The tunnel lingers over what it opened onto while it fades: the memories space on the way in, the sky on the way back.
  const [portalLinger, setPortalLinger] = useState<"out" | "back" | null>(null)
  const reduced = useReducedMotion()
  const [skyFailed, setSkyFailed] = useState(false)
  const portalExit = useRef<ReturnType<typeof setTimeout>>(undefined)
  const skyRef = useRef<HalftoneSkyHandle>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLElement>(null)
  const [cursorTarget, setCursorTarget] = useState<CursorTarget | null>(null)

  const params = useMemo(() => resolveSkyParams(preset), [preset])
  const keepOut = useCallback(
    (width: number, height: number) =>
      skyKeepOut(
        width,
        height,
        params.planet ? { x: params.planetX, y: params.planetY, radius: params.planetRadius } : undefined,
      ),
    [params],
  )
  const { screen } = journey
  const facet = findFacet(journey.facetId)
  const gateActive = screen === "gate"

  // A star the reticle has captured must not drift out from under the pointer, so the parallax
  // freezes while something is captured (which includes the press itself). On release the layer
  // eases back onto the live shift instead of jumping.
  const capturedRef = useRef(false)
  const parallaxRef = useRef<{ state: ParallaxState; at: number }>({ state: PARALLAX_REST, at: 0 })
  const onCapture = useCallback((target: CursorTarget | null) => {
    capturedRef.current = target !== null
    setCursorTarget(target)
  }, [])

  // Stable, so the sky's render loop never re-subscribes; it moves the label layer without React state.
  const onLayerShift = useCallback((x: number, y: number) => {
    const layer = layerRef.current
    const p = parallaxRef.current
    const now = performance.now()
    const dt = p.at === 0 ? 0 : Math.min((now - p.at) / 1000, 0.1)
    p.at = now
    p.state = stepParallax(p.state, { x, y }, capturedRef.current, dt)
    if (layer) layer.style.transform = `translate(${p.state.x}px, ${p.state.y}px)`
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
      if (cancelled) return
      const outcome = result.status === "granted" ? "granted" : "denied"
      track(outcome === "granted" ? "gate_granted" : "gate_denied")
      dispatchGate({ type: "resolved", result: outcome })
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

  // The orb opened: fly the tunnel (tinted with the orb's colors) to the memories space, then let it go.
  useEffect(() => {
    if (screen !== "orbWarp") return
    const warp = setTimeout(() => {
      dispatch({ type: "orbArrived" })
      setPortalLinger("out")
      clearTimeout(portalExit.current)
      portalExit.current = setTimeout(() => setPortalLinger(null), ORB_EXIT_MS)
    }, ORB_WARP_MS)
    return () => clearTimeout(warp)
  }, [screen])

  // The way back: the same tunnel at about half the trip, opening over the memories and fading into the sky, which
  // is already painting. Under reduced motion there is no tunnel: the memories just fade out over the sky.
  useEffect(() => {
    if (screen !== "orbReturn") return
    const back = setTimeout(
      () => {
        dispatch({ type: "orbReturned" })
        if (reduced) return
        setPortalLinger("back")
        clearTimeout(portalExit.current)
        portalExit.current = setTimeout(() => setPortalLinger(null), ORB_RETURN_EXIT_MS)
      },
      reduced ? ORB_RETURN_REDUCED_MS : ORB_RETURN_MS,
    )
    return () => clearTimeout(back)
  }, [screen, reduced])
  useEffect(() => () => clearTimeout(portalExit.current), [])

  // The captured star (cursor) or the hovered/keyboard-focused one lights up in the sky.
  const focusIndex = focusIndexFor(screen, cursorTarget?.id ?? null, journey.hoveredFacet, FACET_IDS)
  useEffect(() => {
    skyRef.current?.focus(focusIndex >= 0 ? focusIndex : null)
  }, [focusIndex])

  const origin = journeyOriginFor(journey, facet)
  const orbShown = screen === "sky" || screen === "orbWarp" || screen === "memories" || screen === "orbReturn"
  const tunnelUp = screen === "orbWarp" || (screen === "orbReturn" && !reduced)
  const tunnelBack = screen === "orbReturn" || portalLinger === "back"
  const listSide = listSideFor((facet ?? FACETS[0]).x)
  const entry = (facet ?? FACETS[0]).entries[journey.entryIndex] ?? (facet ?? FACETS[0]).entries[0]

  return (
    <main
      ref={stageRef}
      className="ui relative h-svh w-full overflow-clip bg-void font-sans text-ink"
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
          hidden={skyPausedFor(screen)}
          allowSparkles={screen === "sky"}
          onLayerShift={onLayerShift}
          onUnavailable={() => setSkyFailed(true)}
        >
          {screen === "sky" && (
            <FacetStars
              facets={FACETS}
              hovered={journey.hoveredFacet}
              sky={skyRef}
              layerRef={layerRef}
              onHover={(id) => dispatch({ type: "hover", facetId: id })}
              onOpen={(f) => {
                track("facet_opened", { facet: f.id })
                dispatch({ type: "facetOpened", facetId: f.id })
              }}
            />
          )}
          {orbShown && (
            <Orb
              active={screen !== "memories"}
              interactive={screen === "sky"}
              held={cursorTarget?.id === ORB_CURSOR_ID || screen === "orbWarp"}
              parked={screen === "orbReturn"}
              sky={skyRef}
              keepOut={keepOut}
              fallbackGlow={skyFailed}
              onSummon={() => track("memory_orb_summoned")}
              onOpen={(at) => {
                track("memory_orb_opened")
                dispatch({ type: "orbOpened", ...at })
              }}
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
          className={`rise pointer-events-none absolute top-[max(2.5rem,calc(env(safe-area-inset-top)+0.75rem))] left-12 m-0 text-xs font-normal tracking-[0.12em] text-ink-muted ${SHADOW}`}
        >
          patriciopastor
        </h1>
      )}

      {screen === "place" && facet && (
        <div className="absolute inset-0">
          <BackButton label="Universo" hint="Volver al universo" onClick={() => dispatch({ type: "back" })} />
          <FacetPlace
            facet={facet}
            listSide={listSide}
            onOpenEntry={(index) => {
              track("entry_opened", { facet: facet.id, index })
              dispatch({ type: "entryOpened", index })
            }}
          />
        </div>
      )}

      {screen === "entry" && facet && (
        <div className="absolute inset-0">
          <BackButton label={facet.name} hint={`Volver a ${facet.name}`} onClick={() => dispatch({ type: "back" })} />
          <div className="pointer-events-none absolute inset-0 flex justify-center overflow-y-auto overscroll-contain px-6 [@media(max-height:520px)]:pt-[76px]">
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

      {(screen === "memories" || screen === "orbReturn") && (
        <div
          data-memories-layer
          className="absolute inset-0"
          style={{
            // Reduced motion: no tunnel on the way back, so the memories fade out over the sky instead of being cut.
            opacity: reduced && screen === "orbReturn" ? 0 : 1,
            transition: reduced ? `opacity ${ORB_RETURN_REDUCED_MS}ms ease` : undefined,
          }}
        >
          {/* The place paints its own opaque void, so the way back sits above it. */}
          <MemoriesSpace accent={ORB_PORTAL.rings[1]} />
          {screen === "memories" && (
            <BackButton label="Universo" hint="Volver al universo" onClick={() => dispatch({ type: "back" })} />
          )}
        </div>
      )}

      {(tunnelUp || portalLinger) && (
        <div
          data-portal
          aria-hidden="true"
          className="gate pointer-events-none absolute inset-0"
          style={{
            opacity: tunnelUp ? 1 : 0,
            transform: `scale(${tunnelUp ? 1 : 1.5})`,
            transformOrigin: `${origin.x}% ${origin.y}%`,
            // The way back lets go faster, and finishes fading before the layer is removed.
            ...(tunnelBack
              ? {
                  transition: `opacity ${ORB_RETURN_FADE_MS}ms cubic-bezier(0.23, 1, 0.32, 1), transform ${ORB_RETURN_EXIT_MS}ms cubic-bezier(0.23, 1, 0.32, 1)`,
                }
              : null),
          }}
        >
          <div
            className={tunnelBack ? "portal-in portal-in-back absolute inset-0" : "portal-in absolute inset-0"}
            style={{ transformOrigin: `${origin.x}% ${origin.y}%` }}
          >
            <AsciiTunnel gate="granted" palette={ORB_PORTAL} />
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
            onSubmit={() => {
              // One event per accepted submit; refused or repeated ones never reach "checking".
              const next = gateReducer(gate, { type: "submit" })
              if (next.status === "checking" && gate.status !== "checking") track("gate_submitted")
              dispatchGate({ type: "submit" })
            }}
            onRequestInvite={(copied) => {
              track("access_requested")
              dispatchGate({ type: "requestInvite", copied })
            }}
          />
        </div>
      )}
      {onReplayIntro && (screen === "sky" || (screen === "gate" && gate.status !== "granted")) && (
        <ReplayIntroButton onClick={onReplayIntro} />
      )}
      <MagneticCursor stageRef={stageRef} onCapture={onCapture} />
      <ContextPanel target={cursorTarget} />
    </main>
  )
}
