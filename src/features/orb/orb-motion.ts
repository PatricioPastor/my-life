import { orbColor } from "./orb-color"
import type { Rgb } from "./oklch"
import { createOrbPath, type Point, type Rect } from "./orb-path"
import { lensRadius, peekScale, stepPeek } from "./orb-peek"
import { stepFollow, summonDuration, summonEase, summonLanding } from "./orb-summon"

export interface OrbMetrics {
  /** The glow's radius in CSS px: smaller on a phone, where there is little room to float. */
  radius: number
  /** Least distance from the orb's center to a keep-out box: the glow's visible reach plus some air. */
  clearance: number
  /** Least distance from the orb's center to the viewport edge. */
  margin: number
}

export function orbMetrics(width: number, height: number): OrbMetrics {
  const radius = Math.min(Math.max(Math.min(width, height) * 0.05, 30), 46)
  const clearance = Math.round(radius * 1.25 + 4)
  return { radius, clearance, margin: clearance + 3 }
}

// Seconds. Easing to a stop is a touch brisk so the orb is easy to click; setting off again is slower.
const STOP_TAU = 0.6
const GO_TAU = 0.7
const FADE_IN_TAU = 0.8
const FADE_OUT_TAU = 0.7
const LIFT_TAU = 0.25
// A tab that was hidden hands over one huge dt; the orb takes it as a short beat, not a leap.
const MAX_DT = 0.1
const REDUCED_TRAVEL = 0.1
const REDUCED_COLOR = 0.25

// Summoning (see orb-summon.ts for the flight profile).
// Stiffness of the live target in rad/s: it settles in about 0.7 s, so a cursor on the move bends the flight gently.
const FOLLOW_OMEGA = 7
// How long it stays near the cursor, from arrival; hovering or capturing it holds it there and the count starts over.
export const SUMMON_HOLD_S = 4
// The way back onto its wander is a slow blend: 3 s for a short way up to 4.5 s for the whole screen.
const RESUME_MIN_S = 3
const RESUME_MAX_S = 4.5
const RESUME_FAR_PX = 1400
// Reduced motion: a short fade out, then a fade in at the new place. Squared, so the orb is truly gone when it moves.
const FADE_OUT_S = 0.15
const FADE_IN_S = 0.2

const ease = (current: number, target: number, tau: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-dt / tau))

/** How much of its full speed the orb travels at: eases to 0 while captured and back to 1 on release. */
export function stepRate(rate: number, held: boolean, dt: number): number {
  const next = held ? ease(rate, 0, STOP_TAU, dt) : ease(rate, 1, GO_TAU, dt)
  return Math.min(Math.max(next, 0), 1)
}

export interface OrbFrame {
  /** Center in CSS px from the top-left of the sky. */
  x: number
  y: number
  radius: number
  /** 0 hidden, 1 fully lit. */
  energy: number
  rgb: Rgb
  hex: string
  hue: number
  /** Travel speed as a share of full speed, for tests and debugging. */
  rate: number
  /** 0 floating as a glow, 1 fully grown into the window onto the memories dimension. */
  peek: number
  /** How much the lens is enlarged right now: 1 at rest up to the scale the surroundings allow. */
  zoom: number
  /** The lens sphere's radius in CSS px. */
  lens: number
  /** Where it is in a summon: not summoned, on its way, parked near the cursor, blending back, or fading (reduced motion). */
  summon: SummonPhase
}

export type SummonPhase = "idle" | "flying" | "holding" | "returning" | "fading"

export interface OrbMotion {
  setViewport: (width: number, height: number, keepOut: readonly Rect[]) => void
  /**
   * `held` is the cursor, the pointer or the keyboard being on the orb: it stops and peeks. `parked` stops it
   * without the peek (a trip is under way and the orb waits where it was).
   */
  step: (
    dt: number,
    input: {
      held: boolean
      active: boolean
      parked?: boolean
      /** The cursor in CSS px from the top-left of the sky; null or missing before it has ever moved. */
      pointer?: Point | null
    },
  ) => OrbFrame
  /** Calls the orb to the cursor on the next step. Ignored while it is already on its way. */
  summon: () => void
  /** Drops a summon where the orb is, with no jump, so it wanders on from there once it is free. */
  cancelSummon: () => void
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
// Zero speed at both ends, so a blend never starts or stops with a kick.
const smooth = (v: number) => v * v * (3 - 2 * v)

export function createOrbMotion({ seed, reduced }: { seed: number; reduced: boolean }): OrbMotion {
  let path: ((t: number) => Point) | null = null
  let baseRadius = 40
  let travel = 0
  let colorClock = 0
  let rate = 1
  let presence = 0
  let lift = 0
  let peek = 0
  let space = { width: 1, height: 1, keepOut: [] as readonly Rect[] }

  // The summon state machine. `pos` is where the orb is drawn; on the wander it is just the path.
  let phase: SummonPhase = "idle"
  let wanted = false
  let pos: Point = { x: 0, y: 0 }
  let flight = { from: pos, t: 0, duration: 1 }
  // The live target as a critically damped follower, so a moving cursor never kicks the flight.
  let follow = { x: { x: 0, v: 0 }, y: { x: 0, v: 0 } }
  let rest: Point = pos
  let holdLeft = 0
  // Under reduced motion a cancelled summon fades back as soon as it is free.
  let leaving = false
  let blend = { from: pos, v: 0, duration: RESUME_MIN_S }
  let fade = { stage: "out" as "out" | "in", t: 0, then: "hold" as "hold" | "idle", moving: false }

  const landing = (pointer: Point | null | undefined): Point => {
    const m = orbMetrics(space.width, space.height)
    return summonLanding({
      pointer: pointer ?? { x: space.width / 2, y: space.height / 2 },
      width: space.width,
      height: space.height,
      keepOut: space.keepOut,
      radius: baseRadius,
      clearance: m.clearance,
      margin: m.margin,
    })
  }

  const fadeValue = () => {
    if (phase !== "fading") return 1
    const k = fade.stage === "out" ? 1 - fade.t / FADE_OUT_S : fade.t / FADE_IN_S
    const v = Math.min(Math.max(k, 0), 1)
    return v * v
  }

  /** Starts fading out from wherever the fade is now, so a change of mind never makes the brightness jump. */
  const fadeOut = (then: "hold" | "idle", moving: boolean) => {
    const current = fadeValue()
    fade = { stage: "out", t: FADE_OUT_S * (1 - Math.sqrt(current)), then, moving }
    phase = "fading"
  }

  /** Blends from the current spot back onto the wander, or just goes idle when there is nothing to blend. */
  const beginReturn = (base: Point) => {
    if (reduced) {
      fadeOut("idle", false)
      return
    }
    const away = dist(pos, base)
    if (away < 0.5) {
      phase = "idle"
      return
    }
    startBlend(away)
  }

  const startBlend = (away: number) => {
    blend = { from: pos, v: 0, duration: RESUME_MIN_S + (RESUME_MAX_S - RESUME_MIN_S) * Math.min(away / RESUME_FAR_PX, 1) }
    phase = "returning"
  }

  return {
    setViewport(width, height, keepOut) {
      space = { width, height, keepOut }
      const m = orbMetrics(width, height)
      path = createOrbPath({ seed, width, height, keepOut, clearance: m.clearance, margin: m.margin })
      baseRadius = m.radius
    },
    summon() {
      wanted = true
    },
    cancelSummon() {
      wanted = false
      if (phase === "flying" || phase === "holding") {
        // It goes back as soon as it is free (not held, not parked), so a trip never leaves it stuck.
        if (reduced) leaving = true
        // Where it is becomes the start of the blend back: no jump, whatever the phase it was in.
        else startBlend(dist(pos, path ? path(travel) : pos))
      } else if (phase === "fading") {
        fade.then = "idle"
        if (fade.stage === "in") fadeOut("idle", false)
      }
    },
    step(rawDt, { held, active, parked = false, pointer }) {
      const dt = Math.min(Math.max(rawDt, 0), MAX_DT)
      const frozen = held || parked
      const summoned = phase === "flying" || phase === "holding" || phase === "fading"
      rate = stepRate(rate, frozen || summoned, dt)
      peek = stepPeek(peek, held ? 1 : 0, dt, reduced)
      presence = ease(presence, active ? 1 : 0, active ? FADE_IN_TAU : FADE_OUT_TAU, dt)
      if (presence < 1e-3 && !active) presence = 0
      lift = ease(lift, held ? 1 : 0, LIFT_TAU, dt)
      travel += rate * dt * (reduced ? REDUCED_TRAVEL : 1)
      colorClock += dt * (reduced ? REDUCED_COLOR : 1)
      const base = path ? path(travel) : { x: 0, y: 0 }

      if (wanted) {
        wanted = false
        leaving = false
        if (reduced) {
          // Already fading out toward a spot: the same fade carries on and reads the cursor when it gets there.
          if (!(phase === "fading" && fade.stage === "out" && fade.then === "hold")) fadeOut("hold", phase === "idle")
        } else if (phase !== "flying") {
          const to = landing(pointer)
          const from = phase === "idle" ? base : pos
          follow = { x: { x: to.x, v: 0 }, y: { x: to.y, v: 0 } }
          flight = { from, t: 0, duration: summonDuration(dist(from, to)) }
          pos = from
          phase = "flying"
        }
      }

      switch (phase) {
        case "idle":
          pos = base
          break
        case "flying": {
          const to = landing(pointer)
          follow = { x: stepFollow(follow.x, to.x, FOLLOW_OMEGA, dt), y: stepFollow(follow.y, to.y, FOLLOW_OMEGA, dt) }
          flight.t += dt
          const u = flight.t / flight.duration
          const k = summonEase(u)
          const target = { x: follow.x.x, y: follow.y.x }
          pos = { x: flight.from.x + (target.x - flight.from.x) * k, y: flight.from.y + (target.y - flight.from.y) * k }
          if (u >= 1) {
            // Arrived: the cursor is read for the last time, and the follower glides to rest on it.
            rest = to
            holdLeft = SUMMON_HOLD_S
            phase = "holding"
            pos = target
          }
          break
        }
        case "holding":
          follow = { x: stepFollow(follow.x, rest.x, FOLLOW_OMEGA, dt), y: stepFollow(follow.y, rest.y, FOLLOW_OMEGA, dt) }
          pos = { x: follow.x.x, y: follow.y.x }
          // Hovering, capturing or a trip holds it; the four seconds begin again once it is let go.
          holdLeft = frozen && !leaving ? SUMMON_HOLD_S : holdLeft - dt
          if (holdLeft <= 0 || (leaving && !frozen)) {
            leaving = false
            beginReturn(base)
          }
          break
        case "returning": {
          if (!frozen) blend.v = Math.min(blend.v + dt / blend.duration, 1)
          const w = smooth(blend.v)
          // Between a fixed point and the live path: it eases off from rest and arrives with the path's own pace.
          pos = { x: blend.from.x + (base.x - blend.from.x) * w, y: blend.from.y + (base.y - blend.from.y) * w }
          if (blend.v >= 1) {
            phase = "idle"
            pos = base
          }
          break
        }
        case "fading": {
          fade.t += dt
          if (fade.stage === "out") {
            if (fade.moving) pos = base
            if (fade.t >= FADE_OUT_S) {
              fade = { ...fade, stage: "in", t: 0 }
              if (fade.then === "hold") {
                rest = landing(pointer)
                follow = { x: { x: rest.x, v: 0 }, y: { x: rest.y, v: 0 } }
                pos = rest
              } else {
                pos = base
              }
            }
          } else if (fade.then === "idle" && fade.t < FADE_IN_S) {
            pos = base
          } else if (fade.t >= FADE_IN_S) {
            if (fade.then === "hold") {
              holdLeft = SUMMON_HOLD_S
              phase = "holding"
            } else {
              phase = "idle"
            }
          }
          break
        }
      }

      const at = pos
      const color = orbColor(colorClock)
      // A slow breath, so a held orb still reads as alive.
      const breath = 0.96 + 0.04 * Math.sin((2 * Math.PI * colorClock) / 7)
      // The lens may grow only as far as the room around the orb allows; it is continuous in position.
      const scale = peekScale({ x: at.x, y: at.y, radius: baseRadius, ...space, reduced })
      return {
        x: at.x,
        y: at.y,
        radius: baseRadius * (1 + 0.14 * lift),
        energy: presence * breath * fadeValue(),
        rgb: color.rgb,
        hex: color.hex,
        hue: color.hue,
        rate,
        peek,
        zoom: 1 + (scale - 1) * peek,
        lens: lensRadius(baseRadius, scale, peek),
        summon: phase,
      }
    },
  }
}
