import { orbColor } from "./orb-color"
import type { Rgb } from "./oklch"
import { createOrbPath, type Point, type Rect } from "./orb-path"
import { lensRadius, peekScale, stepPeek } from "./orb-peek"

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
}

export interface OrbMotion {
  setViewport: (width: number, height: number, keepOut: readonly Rect[]) => void
  /**
   * `held` is the cursor, the pointer or the keyboard being on the orb: it stops and peeks. `parked` stops it
   * without the peek (a trip is under way and the orb waits where it was).
   */
  step: (dt: number, input: { held: boolean; active: boolean; parked?: boolean }) => OrbFrame
}

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

  return {
    setViewport(width, height, keepOut) {
      space = { width, height, keepOut }
      const m = orbMetrics(width, height)
      path = createOrbPath({ seed, width, height, keepOut, clearance: m.clearance, margin: m.margin })
      baseRadius = m.radius
    },
    step(rawDt, { held, active, parked = false }) {
      const dt = Math.min(Math.max(rawDt, 0), MAX_DT)
      rate = stepRate(rate, held || parked, dt)
      peek = stepPeek(peek, held ? 1 : 0, dt, reduced)
      presence = ease(presence, active ? 1 : 0, active ? FADE_IN_TAU : FADE_OUT_TAU, dt)
      if (presence < 1e-3 && !active) presence = 0
      lift = ease(lift, held ? 1 : 0, LIFT_TAU, dt)
      travel += rate * dt * (reduced ? REDUCED_TRAVEL : 1)
      colorClock += dt * (reduced ? REDUCED_COLOR : 1)
      const at = path ? path(travel) : { x: 0, y: 0 }
      const color = orbColor(colorClock)
      // A slow breath, so a held orb still reads as alive.
      const breath = 0.96 + 0.04 * Math.sin((2 * Math.PI * colorClock) / 7)
      // The lens may grow only as far as the room around the orb allows; it is continuous in position.
      const scale = peekScale({ x: at.x, y: at.y, radius: baseRadius, ...space, reduced })
      return {
        x: at.x,
        y: at.y,
        radius: baseRadius * (1 + 0.14 * lift),
        energy: presence * breath,
        rgb: color.rgb,
        hex: color.hex,
        hue: color.hue,
        rate,
        peek,
        zoom: 1 + (scale - 1) * peek,
        lens: lensRadius(baseRadius, scale, peek),
      }
    },
  }
}
