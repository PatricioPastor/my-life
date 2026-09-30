import { describe, expect, it } from "vitest"
import type { GateStatus } from "./gate-machine"
import { PROFILES, createHeartbeat, surgeEnvelope, waveProgress, type Beat } from "./heartbeat"

const DT = 1 / 120

function run(seed: number, gate: GateStatus, seconds: number): Beat[] {
  const hb = createHeartbeat(seed)
  const beats: Beat[] = []
  for (let t = 0; t < seconds; t += DT) beats.push(...hb.advance(DT, gate))
  return beats
}

describe("waveProgress", () => {
  it("runs 0 to 1 smoothly over the travel time and holds", () => {
    expect(waveProgress(0, 2)).toBe(0)
    expect(waveProgress(2, 2)).toBe(1)
    expect(waveProgress(5, 2)).toBe(1)
    expect(waveProgress(-1, 2)).toBe(0)
    let prev = 0
    for (let t = 0; t <= 2; t += 0.002) {
      const p = waveProgress(t, 2)
      expect(p).toBeGreaterThanOrEqual(prev)
      expect(p - prev).toBeLessThan(0.01)
      prev = p
    }
  })
})

describe("surgeEnvelope", () => {
  it("starts and ends at rest, stays within 0..1 and never jumps", () => {
    expect(surgeEnvelope(0)).toBe(0)
    expect(surgeEnvelope(10)).toBe(0)
    let prev = 0
    let peak = 0
    for (let t = 0; t <= 2; t += 0.002) {
      const e = surgeEnvelope(t)
      expect(e).toBeGreaterThanOrEqual(0)
      expect(e).toBeLessThanOrEqual(1)
      expect(Math.abs(e - prev)).toBeLessThan(0.03)
      peak = Math.max(peak, e)
      prev = e
    }
    expect(peak).toBeGreaterThan(0.95)
  })
})

describe("createHeartbeat", () => {
  it("is deterministic for a seed and varies across seeds", () => {
    expect(run(7, "idle", 30)).toEqual(run(7, "idle", 30))
    expect(run(7, "idle", 30)).not.toEqual(run(8, "idle", 30))
  })

  it("fires a first beat right away", () => {
    const beats = run(1, "idle", 0.1)
    expect(beats[0]?.kind).toBe("lub")
    expect(beats[0]?.time).toBeLessThan(0.05)
  })

  it("keeps idle beats calm: 0.9 to 1.5 s between plain beats", () => {
    const beats = run(3, "idle", 240)
    let checked = 0
    for (let i = 1; i < beats.length; i++) {
      if (beats[i].kind !== "lub" || beats[i - 1].kind !== "lub") continue
      const gap = beats[i].time - beats[i - 1].time
      expect(gap).toBeGreaterThanOrEqual(0.9 - 2 * DT)
      expect(gap).toBeLessThanOrEqual(1.5 + 2 * DT)
      checked++
    }
    expect(checked).toBeGreaterThan(20)
  })

  it("keeps every interval inside the bounds of its profile", () => {
    for (const gate of Object.keys(PROFILES) as GateStatus[]) {
      const p = PROFILES[gate]
      const beats = run(11, gate, 120)
      for (let i = 1; i < beats.length; i++) {
        const gap = beats[i].time - beats[i - 1].time
        expect(gap).toBeGreaterThan(0)
        expect(gap).toBeLessThanOrEqual(p.travel[1] + 2 * DT)
      }
    }
  })

  it("adds lub-dub doubles with a weaker, shorter second beat", () => {
    const beats = run(5, "idle", 240)
    const dubs = beats.filter((b) => b.kind === "dub")
    const lubs = beats.filter((b) => b.kind === "lub")
    expect(dubs.length).toBeGreaterThan(5)
    expect(dubs.length).toBeLessThan(lubs.length)
    for (let i = 1; i < beats.length; i++) {
      if (beats[i].kind !== "dub") continue
      expect(beats[i - 1].kind).toBe("lub")
      expect(beats[i].time - beats[i - 1].time).toBeLessThan(0.4)
      expect(beats[i].strength).toBeLessThan(beats[i - 1].strength)
    }
  })

  it("fires the next plain beat only after the previous wave passed its threshold", () => {
    for (const gate of ["idle", "checking", "denied", "requested", "granted"] as const) {
      const beats = run(21, gate, 120)
      for (let i = 1; i < beats.length; i++) {
        if (beats[i].kind !== "lub") continue
        expect(beats[i].prevProgress).toBeGreaterThanOrEqual(beats[i].threshold)
        expect(beats[i].threshold).toBeGreaterThanOrEqual(PROFILES[gate].threshold[0])
        expect(beats[i].threshold).toBeLessThanOrEqual(PROFILES[gate].threshold[1])
      }
    }
  })

  it("beats faster and harder while checking, slower and weaker when denied", () => {
    const rate = (gate: GateStatus) => run(2, gate, 120).length
    const strength = (gate: GateStatus) => Math.max(...run(2, gate, 60).map((b) => b.strength))
    expect(rate("checking")).toBeGreaterThan(rate("idle"))
    expect(rate("denied")).toBeLessThan(rate("idle"))
    expect(strength("checking")).toBeGreaterThan(strength("idle"))
    expect(strength("denied")).toBeLessThan(strength("idle"))
  })

  it("merges into a steady surge when granted", () => {
    const hb = createHeartbeat(9)
    let lo = 1
    for (let t = 0; t < 6; t += DT) {
      hb.advance(DT, "granted")
      if (t > 2) lo = Math.min(lo, hb.sample().surge)
    }
    expect(lo).toBeGreaterThan(0.5)
  })

  it("keeps the sampled surge bounded and continuous, even as the gate changes", () => {
    const hb = createHeartbeat(4)
    const seq: GateStatus[] = ["idle", "checking", "denied", "requested", "granted", "idle"]
    let prev = 0
    let n = 0
    for (const gate of seq) {
      for (let t = 0; t < 8; t += 1 / 240) {
        hb.advance(1 / 240, gate)
        const s = hb.sample()
        expect(s.surge).toBeGreaterThanOrEqual(0)
        expect(s.surge).toBeLessThanOrEqual(1)
        if (n++ > 0) expect(Math.abs(s.surge - prev)).toBeLessThan(0.08)
        prev = s.surge
        for (let w = 0; w < s.waveCount; w++) {
          expect(s.waves[w].progress).toBeGreaterThanOrEqual(0)
          expect(s.waves[w].progress).toBeLessThanOrEqual(1)
          expect(s.waves[w].fade).toBeGreaterThanOrEqual(0)
          expect(s.waves[w].fade).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it("keeps the wave list small and drops finished waves", () => {
    const hb = createHeartbeat(6)
    for (let t = 0; t < 60; t += DT) {
      hb.advance(DT, "granted")
      expect(hb.sample().waveCount).toBeLessThanOrEqual(8)
    }
  })

  it("survives a huge frame gap without spawning a burst", () => {
    const hb = createHeartbeat(2)
    hb.advance(DT, "idle")
    expect(hb.advance(60, "idle").length).toBeLessThanOrEqual(3)
  })
})
