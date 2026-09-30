import type { GateStatus } from "./gate-machine"
import { smooth } from "./color-blend"

type Range = readonly [number, number]

export interface HeartbeatProfile {
  /** Seconds a wave takes to travel from the vanishing point to the viewer. */
  travel: Range
  /** Wave progress at which the next beat may fire. */
  threshold: Range
  /** Chance that a beat is followed by a shorter, weaker second beat (lub-dub). */
  doubleChance: number
  /** Seconds between a lub and its dub. */
  dubGap: Range
  strength: number
}

// Interval between plain beats is about travel * 0.67..0.80 (the time a smoothstep needs to reach 0.75..0.9),
// so idle beats every 0.9..1.5 s.
const CALM: HeartbeatProfile = { travel: [1.4, 1.85], threshold: [0.75, 0.9], doubleChance: 0.24, dubGap: [0.17, 0.26], strength: 0.7 }

export const PROFILES: Record<GateStatus, HeartbeatProfile> = {
  idle: CALM,
  invalid: CALM,
  checking: { travel: [0.85, 1.25], threshold: [0.75, 0.9], doubleChance: 0.35, dubGap: [0.14, 0.2], strength: 1.1 },
  denied: { travel: [2.6, 3.4], threshold: [0.75, 0.9], doubleChance: 0.05, dubGap: [0.22, 0.3], strength: 0.3 },
  requested: { travel: [1.7, 2.2], threshold: [0.75, 0.9], doubleChance: 0.12, dubGap: [0.2, 0.28], strength: 0.5 },
  // Waves fire early in each other's travel, so their surges overlap into one continuous rush.
  granted: { travel: [0.5, 0.7], threshold: [0.3, 0.45], doubleChance: 0, dubGap: [0.2, 0.2], strength: 1 },
}

const DUB_STRENGTH = 0.6
const DUB_TRAVEL = 0.75
const ATTACK = 0.18
const DECAY = 0.75
/** A wave stays in the list until its surge has died down, even if it already reached the viewer. */
const LIFETIME = ATTACK + DECAY
const MAX_WAVES = 8
/** Longest step honored; a tab that slept must not fire a burst of beats. */
const MAX_DT = 0.25
const SURGE_GAIN = 1.3

export interface Beat {
  /** Seconds since the heartbeat started. */
  time: number
  kind: "lub" | "dub"
  strength: number
  /** Progress of the previous wave when this beat fired, and the threshold it had to pass (0 for the first beat). */
  prevProgress: number
  threshold: number
}

export interface WaveSample {
  /** 0 at the vanishing point, 1 at the viewer. */
  progress: number
  /** Brightness weight: 0 at both ends of the trip, 1 in the middle, times nothing else. */
  fade: number
  strength: number
}

export interface HeartbeatSample {
  /** Combined speed surge 0..1. */
  surge: number
  waves: WaveSample[]
  waveCount: number
}

export interface Heartbeat {
  advance: (dt: number, gate: GateStatus) => Beat[]
  sample: () => HeartbeatSample
}

/** Eased progress of a wave `age` seconds after its beat. */
export function waveProgress(age: number, travel: number): number {
  return smooth(age / travel)
}

/** Speed surge of one beat `age` seconds after it: an eased rise, then an eased fall, 0 at both ends. */
export function surgeEnvelope(age: number): number {
  if (age <= 0 || age >= LIFETIME) return 0
  if (age < ATTACK) return smooth(age / ATTACK)
  return 1 - smooth((age - ATTACK) / DECAY)
}

interface Wave {
  age: number
  travel: number
  threshold: number
  strength: number
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A seeded, irregular heartbeat. Each beat launches a wave from the vanishing point; the next
 * beat fires only once that wave is near the end of its trip, so beats chain instead of overlapping
 * abruptly. Some beats are followed by a shorter, weaker second beat. The gate state sets the rhythm.
 */
export function createHeartbeat(seed: number): Heartbeat {
  const rand = mulberry32(seed)
  const range = ([lo, hi]: Range) => lo + (hi - lo) * rand()
  let time = 0
  let waves: Wave[] = []
  let last: Wave | null = null
  let pendingDub: { at: number; wave: Wave } | null = null
  const out: HeartbeatSample = {
    surge: 0,
    waves: Array.from({ length: MAX_WAVES }, () => ({ progress: 0, fade: 0, strength: 0 })),
    waveCount: 0,
  }

  const launch = (kind: "lub" | "dub", profile: HeartbeatProfile, lub?: Wave): Beat => {
    const prevProgress = last ? waveProgress(last.age, last.travel) : 0
    const threshold = last ? last.threshold : 0
    const strength = lub ? lub.strength * DUB_STRENGTH : profile.strength * (0.9 + 0.2 * rand())
    const wave: Wave = {
      age: 0,
      travel: lub ? lub.travel * DUB_TRAVEL : range(profile.travel),
      threshold: range(profile.threshold),
      strength,
    }
    waves.push(wave)
    if (waves.length > MAX_WAVES) waves = waves.slice(-MAX_WAVES)
    last = wave
    return { time, kind, strength, prevProgress, threshold }
  }

  return {
    advance(dt, gate) {
      const step = Math.min(Math.max(dt, 0), MAX_DT)
      const profile = PROFILES[gate]
      time += step
      for (const w of waves) w.age += step
      waves = waves.filter((w) => w.age < Math.max(w.travel, LIFETIME))
      const beats: Beat[] = []

      if (!last) {
        const beat = launch("lub", profile)
        beats.push(beat)
        if (rand() < profile.doubleChance && last) pendingDub = { at: time + range(profile.dubGap), wave: last }
      } else if (pendingDub) {
        if (time >= pendingDub.at) {
          beats.push(launch("dub", profile, pendingDub.wave))
          pendingDub = null
        }
      } else if (waveProgress(last.age, last.travel) >= last.threshold) {
        beats.push(launch("lub", profile))
        if (rand() < profile.doubleChance && last) pendingDub = { at: time + range(profile.dubGap), wave: last }
      }
      return beats
    },

    sample() {
      let sum = 0
      let n = 0
      for (const w of waves) {
        sum += w.strength * surgeEnvelope(w.age)
        const p = waveProgress(w.age, w.travel)
        const slot = out.waves[n++]
        slot.progress = p
        slot.fade = 4 * p * (1 - p)
        slot.strength = w.strength
      }
      out.waveCount = n
      out.surge = 1 - Math.exp(-SURGE_GAIN * sum)
      return out
    },
  }
}
