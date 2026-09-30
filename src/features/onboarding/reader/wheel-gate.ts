export interface WheelGateOptions {
  /** Accumulated wheel distance (px) that counts as one deliberate step. */
  threshold: number
  /** After a step, nothing counts for at least this long. */
  cooldownMs: number
  /** After the cooldown, a stream of events with gaps shorter than this is still the same fling (inertia). */
  quietMs: number
  /** Deltas older than this are forgotten: a slow trickle does not add up to a step. */
  accumulateMs: number
  /** Whatever the stream does, the lock never outlasts this. */
  maxLockMs: number
}

export const WHEEL_GATE: WheelGateOptions = { threshold: 40, cooldownMs: 600, quietMs: 140, accumulateMs: 250, maxLockMs: 1500 }

export interface WheelGate {
  /** Feed one wheel event (delta in px, time in ms). Returns the step it amounts to: 1 down, -1 up, 0 nothing yet. */
  feed(deltaY: number, now: number): -1 | 0 | 1
}

/** One step per gesture: a trackpad fling (dozens of events with inertia) must not skip many paragraphs. */
export function createWheelGate(o: WheelGateOptions = WHEEL_GATE): WheelGate {
  let acc = 0
  let lastAt = -Infinity
  let firedAt = -Infinity
  let locked = false

  return {
    feed(deltaY, now) {
      const gap = now - lastAt
      lastAt = now
      if (locked) {
        const since = now - firedAt
        if (since >= o.maxLockMs || (since >= o.cooldownMs && gap >= o.quietMs)) locked = false
        else return 0
      }
      if (gap > o.accumulateMs || Math.sign(deltaY) !== Math.sign(acc)) acc = 0
      acc += deltaY
      if (Math.abs(acc) < o.threshold) return 0
      const step = acc > 0 ? 1 : -1
      acc = 0
      locked = true
      firedAt = now
      return step
    },
  }
}

/** Wheel deltas come in pixels, lines or pages depending on the device: bring them all to pixels. */
export function normalizeWheelDelta(delta: number, deltaMode: number, pageHeight: number): number {
  if (deltaMode === 1) return delta * 16
  if (deltaMode === 2) return delta * pageHeight
  return delta
}
