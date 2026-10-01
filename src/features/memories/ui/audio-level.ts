/**
 * The math behind the talking orb: from the raw samples an AnalyserNode gives to a smooth 0..1 level the orb can
 * pulse with. Everything here is pure, so it is tested without any audio.
 */

/** Below this RMS the microphone is just hissing: the orb stays still. */
const NOISE_FLOOR = 0.006
/** A loud, close voice sits around here; the level is 1 from this RMS up. */
const FULL_SCALE = 0.3

/** How fast the level climbs to a louder voice, and how slowly it falls back (milliseconds): a syllable pops, then lingers. */
const ATTACK_MS = 70
const RELEASE_MS = 240

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/**
 * The root mean square of a time-domain buffer (`getByteTimeDomainData`: unsigned bytes centered on 128), as a
 * fraction of full scale. 0 is silence; a full-scale sine is about 0.7. An empty buffer is silence.
 */
export function byteRms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const centered = (samples[i] - 128) / 128
    sum += centered * centered
  }
  return Math.sqrt(sum / samples.length)
}

/**
 * Maps an RMS to a 0..1 level: nothing under the noise floor, 1 at a loud voice, and a square root in between so a
 * quiet voice still moves the orb visibly. Anything that is not a number is silence.
 */
export function levelFromRms(rms: number): number {
  if (!Number.isFinite(rms) && rms !== Number.POSITIVE_INFINITY) return 0
  const above = Math.max(0, rms - NOISE_FLOOR)
  return clamp01(Math.sqrt(above / (FULL_SCALE - NOISE_FLOOR)))
}

/**
 * One step of an exponential follower toward `target`, over `dtMs`: quick to rise, slow to fall, never past the
 * target. No time (or a negative step) leaves the level where it was; a target that is not a number counts as 0.
 */
export function smoothLevel(previous: number, target: number, dtMs: number): number {
  const goal = Number.isFinite(target) ? clamp01(target) : 0
  if (!(dtMs > 0)) return previous
  const tau = goal > previous ? ATTACK_MS : RELEASE_MS
  return previous + (goal - previous) * (1 - Math.exp(-dtMs / tau))
}

/** The history with `level` added at the end, keeping only the newest `max`. The given array is not changed. */
export function pushLevel(history: readonly number[], level: number, max: number): number[] {
  const next = [...history, level]
  return next.length > max ? next.slice(next.length - max) : next
}

/**
 * The level as it was `lagsMs[i]` ago, for each ripple, from a history sampled every `frameMs` (the newest last).
 * Ripples that read older levels look like the voice travelling outward. Before the voice began it is 0.
 */
export function laggedLevels(history: readonly number[], frameMs: number, lagsMs: readonly number[]): number[] {
  return lagsMs.map((lag) => {
    const index = history.length - 1 - Math.round(lag / frameMs)
    return index >= 0 && index < history.length ? history[index] : 0
  })
}

/**
 * A reader that eases another reader with the same follower as the talking orb (`smoothLevel`: quick to rise, slow to
 * fall), so every orb that shows a voice moves like the same voice. It is stateful and time-based: it must be read
 * once per animation frame, and reading it twice in the same instant gives the same value.
 */
export function smoothedReader(read: () => number, now: () => number = () => performance.now()): () => number {
  let level = 0
  let last: number | null = null
  return () => {
    const at = now()
    if (last !== null) level = smoothLevel(level, read(), at - last)
    last = at
    return level
  }
}
