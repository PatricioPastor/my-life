import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readAudioDuration } from "./audio-duration"

class FakeAudio {
  static last: FakeAudio | null = null
  preload = ""
  src = ""
  duration = Number.NaN
  listeners = new Map<string, () => void>()
  removed = vi.fn()
  constructor() {
    FakeAudio.last = this
  }
  addEventListener(type: string, cb: () => void) {
    this.listeners.set(type, cb)
  }
  removeAttribute = vi.fn()
  load = vi.fn()
  fire(type: string) {
    this.listeners.get(type)?.()
  }
}

const revoke = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  FakeAudio.last = null
  revoke.mockReset()
  vi.stubGlobal("Audio", FakeAudio)
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:probe"), revokeObjectURL: revoke }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const file = new Blob(["x"], { type: "audio/mpeg" })

describe("readAudioDuration", () => {
  it("answers the length in milliseconds once the browser knows it, and frees the probe", async () => {
    const promise = readAudioDuration(file)
    const audio = FakeAudio.last!
    expect(audio.src).toBe("blob:probe")
    expect(audio.preload).toBe("metadata")
    audio.duration = 12.3456
    audio.fire("loadedmetadata")
    expect(await promise).toBe(12_346)
    expect(revoke).toHaveBeenCalledWith("blob:probe")
  })

  it("answers null for a length the browser cannot give (a recording with no header says Infinity)", async () => {
    const promise = readAudioDuration(file)
    FakeAudio.last!.duration = Number.POSITIVE_INFINITY
    FakeAudio.last!.fire("loadedmetadata")
    expect(await promise).toBeNull()
  })

  it("answers null when the file cannot be decoded", async () => {
    const promise = readAudioDuration(file)
    FakeAudio.last!.fire("error")
    expect(await promise).toBeNull()
    expect(revoke).toHaveBeenCalledWith("blob:probe")
  })

  it("answers null instead of waiting forever", async () => {
    const promise = readAudioDuration(file, 1500)
    vi.advanceTimersByTime(1600)
    expect(await promise).toBeNull()
    expect(revoke).toHaveBeenCalledWith("blob:probe")
  })

  it("answers null where there is no Audio element at all", async () => {
    vi.stubGlobal("Audio", undefined)
    expect(await readAudioDuration(file)).toBeNull()
  })
})
