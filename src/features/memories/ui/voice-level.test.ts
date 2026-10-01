import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { byteRms, levelFromRms, smoothLevel, syntheticLevel, useVoiceLevel } from "./voice-level"

describe("byteRms", () => {
  it("is 0 for silence (bytes at the 128 midpoint)", () => {
    expect(byteRms(new Uint8Array(64).fill(128))).toBe(0)
  })

  it("is the root mean square of the wave around the midpoint", () => {
    const data = new Uint8Array(64)
    data.forEach((_, i) => (data[i] = i % 2 === 0 ? 192 : 64))
    expect(byteRms(data)).toBeCloseTo(0.5, 6)
  })

  it("is 0 for an empty buffer", () => {
    expect(byteRms(new Uint8Array(0))).toBe(0)
  })
})

describe("levelFromRms", () => {
  it("maps silence to 0 and stays within 0..1, rising with loudness", () => {
    expect(levelFromRms(0)).toBe(0)
    expect(levelFromRms(0.05)).toBeGreaterThan(0)
    expect(levelFromRms(0.05)).toBeLessThan(levelFromRms(0.2))
    expect(levelFromRms(5)).toBe(1)
  })

  it("lifts quiet speech, so a normal voice already moves the orb", () => {
    expect(levelFromRms(0.1)).toBeGreaterThan(0.25)
  })
})

describe("smoothLevel", () => {
  it("rises faster than it falls", () => {
    const up = smoothLevel(0, 1, 0.05)
    const down = 1 - smoothLevel(1, 0, 0.05)
    expect(up).toBeGreaterThan(down)
  })

  it("converges on the target and never overshoots it", () => {
    let v = 0
    for (let i = 0; i < 120; i++) {
      v = smoothLevel(v, 0.7, 1 / 60)
      expect(v).toBeLessThanOrEqual(0.7 + 1e-9)
    }
    expect(v).toBeCloseTo(0.7, 3)
  })

  it("snaps to zero once it is nearly there, so a loop can stop", () => {
    expect(smoothLevel(0.0005, 0, 0.1)).toBe(0)
  })
})

describe("syntheticLevel", () => {
  it("is a lively, bounded, speech-like level for when there is no analyser", () => {
    let min = 1
    let max = 0
    for (let t = 0; t < 20; t += 0.05) {
      const v = syntheticLevel(t)
      min = Math.min(min, v)
      max = Math.max(max, v)
    }
    expect(min).toBeGreaterThanOrEqual(0)
    expect(max).toBeLessThanOrEqual(1)
    expect(max - min).toBeGreaterThan(0.3)
  })
})

describe("useVoiceLevel", () => {
  let frames: Array<(now: number) => void> = []
  let wave: number
  let created = 0
  let resumed = 0

  class FakeAnalyser {
    fftSize = 1024
    smoothingTimeConstant = 0
    frequencyBinCount = 512
    getByteTimeDomainData(data: Uint8Array) {
      data.forEach((_, i) => (data[i] = 128 + (i % 2 === 0 ? wave : -wave)))
    }
    connect() {}
  }
  class FakeContext {
    state = "suspended"
    destination = {}
    constructor() {
      created++
    }
    createAnalyser() {
      return new FakeAnalyser()
    }
    createMediaElementSource() {
      return { connect: () => {} }
    }
    resume() {
      resumed++
      this.state = "running"
      return Promise.resolve()
    }
  }

  beforeEach(() => {
    frames = []
    wave = 0
    created = 0
    resumed = 0
    vi.stubGlobal("AudioContext", FakeContext)
    vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => frames.push(cb))
    vi.stubGlobal("cancelAnimationFrame", () => {})
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const frame = (now: number) => {
    const next = frames.pop()
    frames = []
    act(() => next?.(now))
  }

  it("reads 0 and builds no audio graph until the audio plays", () => {
    const audio = document.createElement("audio")
    const { result } = renderHook(() => useVoiceLevel(audio))
    expect(result.current()).toBe(0)
    expect(created).toBe(0)
  })

  it("follows the loudness of the audio while it plays", () => {
    const audio = document.createElement("audio")
    const { result } = renderHook(() => useVoiceLevel(audio))
    act(() => {
      audio.dispatchEvent(new Event("play"))
    })
    expect(created).toBe(1)
    expect(resumed).toBe(1)
    wave = 60
    for (let i = 1; i <= 20; i++) frame(i * 16)
    expect(result.current()).toBeGreaterThan(0.3)
  })

  it("builds the audio graph once however many times it plays", () => {
    const audio = document.createElement("audio")
    renderHook(() => useVoiceLevel(audio))
    for (let i = 0; i < 3; i++) {
      act(() => {
        audio.dispatchEvent(new Event("play"))
        audio.dispatchEvent(new Event("pause"))
      })
    }
    expect(created).toBe(1)
  })

  it("falls to zero after it pauses or ends", () => {
    const audio = document.createElement("audio")
    const { result } = renderHook(() => useVoiceLevel(audio))
    act(() => {
      audio.dispatchEvent(new Event("play"))
    })
    wave = 80
    for (let i = 1; i <= 20; i++) frame(i * 16)
    expect(result.current()).toBeGreaterThan(0.3)
    act(() => {
      audio.dispatchEvent(new Event("ended"))
    })
    for (let i = 21; i <= 200; i++) frame(i * 16)
    expect(result.current()).toBe(0)
  })

  it("makes a synthetic level when the browser has no Web Audio, so the orb still talks", () => {
    vi.stubGlobal("AudioContext", undefined)
    const audio = document.createElement("audio")
    const { result } = renderHook(() => useVoiceLevel(audio))
    act(() => {
      audio.dispatchEvent(new Event("play"))
    })
    let peak = 0
    for (let i = 1; i <= 120; i++) {
      frame(i * 16)
      peak = Math.max(peak, result.current())
    }
    expect(peak).toBeGreaterThan(0.2)
  })

  it("does nothing without an audio element", () => {
    const { result } = renderHook(() => useVoiceLevel(null))
    expect(result.current()).toBe(0)
  })
})
