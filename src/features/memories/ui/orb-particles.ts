/**
 * The particles an audio orb throws off while it talks: the louder the voice, the more of them, and the faster they
 * leave. Everything here is pure (the random source is injected) and allocation-free after `createParticles`: the
 * particles live in a fixed pool of typed arrays, so a long, loud voice never feeds the garbage collector.
 */

/** The most particles alive at once, whatever the voice does. */
export const MAX_PARTICLES = 160

/** Under this level the voice is only a hiss: nothing is thrown off. */
const THRESHOLD = 0.05
/** Particles per second at the threshold, and at full level. */
const MIN_RATE = 6
const MAX_RATE = 110
/** How strongly the emission rises with the level (above 1 the quiet end stays calm and the loud end is lively). */
const RATE_CURVE = 1.3

/** Where a particle is born: at the rim, give or take this much of the radius. */
const RIM_JITTER = 0.03
/** The first speed, as a fraction of the sphere's diameter per second: a whisper's drift, and what a loud voice adds. */
const SPEED_BASE = 0.14
const SPEED_LOUD = 0.5
/** Each particle gets between these multiples of that speed, and a little sideways drift. */
const SPEED_SPREAD = [0.6, 1.4] as const
const SIDEWAYS = 0.25
/** Air drag (per second): they leave fast and slow down, so none flies out of the canvas that holds them. */
const DRAG = 1.8
/** How long one lives (seconds). */
const LIFE = [0.9, 2.0] as const
/** Its size in CSS px at a 400 px sphere, and how that follows the sphere's size. */
const SIZE = [1.1, 3] as const
const SIZE_SCALE = [0.8, 1.4] as const

/** A frame longer than this (a tab that was hidden) is treated as this long, so it never throws off a burst. */
const MAX_STEP_MS = 50

const clamp01 = (value: number) => (Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value)))
const between = ([low, high]: readonly [number, number], t: number) => low + (high - low) * t

export interface Particles {
  /** How many are alive: the first `count` entries of every array. */
  count: number
  /** Position from the center of the sphere, in CSS px. */
  x: Float32Array
  y: Float32Array
  /** Velocity, in CSS px per second. */
  vx: Float32Array
  vy: Float32Array
  /** Seconds lived, and how long it will live. */
  age: Float32Array
  life: Float32Array
  /** Radius to draw, in CSS px. */
  size: Float32Array
  /** The fraction of a particle that is owed to the voice and not yet born. */
  carry: number
}

export function createParticles(capacity: number = MAX_PARTICLES): Particles {
  const array = () => new Float32Array(capacity)
  return { count: 0, x: array(), y: array(), vx: array(), vy: array(), age: array(), life: array(), size: array(), carry: 0 }
}

/** Particles per second for a voice level (0..1): none under the hiss, then more the louder it is. */
export function emissionRate(level: number): number {
  const l = clamp01(level)
  if (l < THRESHOLD) return 0
  return MIN_RATE + (MAX_RATE - MIN_RATE) * l ** RATE_CURVE
}

/** How fast a particle leaves, in CSS px per second, for a voice level and the sphere's diameter. */
export function particleSpeed(level: number, diameter: number): number {
  return diameter * (SPEED_BASE + SPEED_LOUD * clamp01(level))
}

/** How visible a particle is at `age` of its `life`: it shows at once, then fades to nothing by the end. 0..1. */
export function particleAlpha(age: number, life: number): number {
  if (!(life > 0)) return 0
  const t = clamp01(age / life)
  const rise = Math.min(t / 0.12, 1)
  return clamp01(rise * rise * (1 - t) ** 1.5)
}

interface StepInput {
  /** The smoothed voice level, 0..1. */
  level: number
  /** The voice is playing: only then are new ones born. The ones in flight always finish their life. */
  emitting: boolean
  /** The sphere's diameter, in CSS px. */
  diameter: number
  /** A source of numbers in [0, 1). Defaults to `Math.random`. */
  rand?: () => number
}

function spawn(p: Particles, input: StepInput, rand: () => number): void {
  const i = p.count++
  const angle = rand() * Math.PI * 2
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const radius = (input.diameter / 2) * (1 - RIM_JITTER + rand() * 2 * RIM_JITTER)
  const speed = particleSpeed(input.level, input.diameter) * between(SPEED_SPREAD, rand())
  const sideways = (rand() * 2 - 1) * SIDEWAYS * speed
  p.x[i] = cos * radius
  p.y[i] = sin * radius
  p.vx[i] = cos * speed - sin * sideways
  p.vy[i] = sin * speed + cos * sideways
  p.age[i] = 0
  p.life[i] = between(LIFE, rand())
  p.size[i] = between(SIZE, rand()) * Math.min(Math.max(input.diameter / 400, SIZE_SCALE[0]), SIZE_SCALE[1])
}

/**
 * Advances the particles by `dtMs`: the living ones drift outward and slow down, the ones whose life is over are
 * removed, and, while the voice plays, new ones are born at the rim at the rate its level asks for. Changes `p` in place.
 */
export function stepParticles(p: Particles, dtMs: number, input: StepInput): void {
  if (!(dtMs > 0)) return
  const dt = Math.min(dtMs, MAX_STEP_MS) / 1000
  const rand = input.rand ?? Math.random
  const slow = Math.exp(-DRAG * dt)

  for (let i = p.count - 1; i >= 0; i--) {
    p.age[i] += dt
    if (p.age[i] >= p.life[i]) {
      const last = --p.count
      p.x[i] = p.x[last]
      p.y[i] = p.y[last]
      p.vx[i] = p.vx[last]
      p.vy[i] = p.vy[last]
      p.age[i] = p.age[last]
      p.life[i] = p.life[last]
      p.size[i] = p.size[last]
      continue
    }
    p.vx[i] *= slow
    p.vy[i] *= slow
    p.x[i] += p.vx[i] * dt
    p.y[i] += p.vy[i] * dt
  }

  if (!input.emitting) {
    p.carry = 0
    return
  }
  p.carry += emissionRate(input.level) * dt
  while (p.carry >= 1 && p.count < p.x.length) {
    spawn(p, input, rand)
    p.carry -= 1
  }
  // A full pool owes nothing: it must not release a burst the moment a place frees up.
  if (p.count >= p.x.length) p.carry = Math.min(p.carry, 1)
}
