import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useAudioLevel, type AudioContextLike, type LevelEnv } from "./use-audio-level"

/** A fake Web Audio context that records how the graph is wired and plays back the bytes it is told to. */
function fakeContext(initialState = "running") {
  const wiring: string[] = []
  let fill = 128
  const analysers: Array<ReturnType<typeof makeAnalyser>> = []
  const makeAnalyser = () => ({
    fftSize: 2048,
    connect: vi.fn(() => wiring.push("analyser->destination")),
    disconnect: vi.fn(),
    getByteTimeDomainData: vi.fn((array: Uint8Array) => {
      // Loud: a full swing on every other sample. Quiet: the center.
      for (let i = 0; i < array.length; i++) array[i] = fill === 128 ? 128 : i % 2 === 0 ? 0 : 255
    }),
  })
  const node = (name: string) => ({
    connect: vi.fn(() => wiring.push(`${name}->analyser`)),
    disconnect: vi.fn(),
  })
  const context = {
    state: initialState,
    destination: { id: "destination" },
    createAnalyser: vi.fn(() => {
      const analyser = makeAnalyser()
      analysers.push(analyser)
      return analyser
    }),
    createMediaElementSource: vi.fn(() => node("element")),
    createMediaStreamSource: vi.fn(() => node("stream")),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  }
  return {
    context: context as unknown as AudioContextLike,
    raw: context,
    wiring,
    analysers,
    loud: () => {
      fill = 0
    },
  }
}

const envOf = (context: AudioContextLike | null): LevelEnv => ({ createContext: () => context })

afterEach(() => cleanup())

describe("useAudioLevel", () => {
  it("reads 0 and builds no audio graph while it is off, or has nothing to listen to", () => {
    const fake = fakeContext()
    const element = document.createElement("audio")
    const off = renderHook(() => useAudioLevel(element, false, envOf(fake.context)))
    expect(off.result.current()).toBe(0)
    const nothing = renderHook(() => useAudioLevel(null, true, envOf(fake.context)))
    expect(nothing.result.current()).toBe(0)
    expect(fake.raw.createAnalyser).not.toHaveBeenCalled()
  })

  it("listens to an audio element through an analyser and still sends it to the speakers", () => {
    const fake = fakeContext()
    const element = document.createElement("audio")
    renderHook(() => useAudioLevel(element, true, envOf(fake.context)))
    expect(fake.raw.createMediaElementSource).toHaveBeenCalledWith(element)
    // Once an element feeds the graph its sound only comes out through it, so the chain must end at the speakers.
    expect(fake.wiring).toEqual(expect.arrayContaining(["element->analyser", "analyser->destination"]))
  })

  it("reads a level from the analyser: 0 for silence, high for a loud voice", () => {
    const fake = fakeContext()
    const element = document.createElement("audio")
    const { result } = renderHook(() => useAudioLevel(element, true, envOf(fake.context)))
    expect(result.current()).toBe(0)
    fake.loud()
    expect(result.current()).toBeGreaterThan(0.9)
  })

  it("listens to a microphone stream without ever sending it to the speakers", () => {
    const fake = fakeContext()
    const stream = {} as MediaStream
    renderHook(() => useAudioLevel(stream, true, envOf(fake.context)))
    expect(fake.raw.createMediaStreamSource).toHaveBeenCalledWith(stream)
    expect(fake.wiring).toContain("stream->analyser")
    expect(fake.wiring).not.toContain("analyser->destination")
  })

  it("disconnects a microphone stream when it goes away", () => {
    const fake = fakeContext()
    const stream = {} as MediaStream
    const { rerender } = renderHook(({ active }) => useAudioLevel(stream, active, envOf(fake.context)), {
      initialProps: { active: true },
    })
    rerender({ active: false })
    const source = fake.raw.createMediaStreamSource.mock.results[0].value as { disconnect: ReturnType<typeof vi.fn> }
    expect(source.disconnect).toHaveBeenCalled()
  })

  it("resumes a context the browser left suspended (autoplay policy)", () => {
    const fake = fakeContext("suspended")
    renderHook(() => useAudioLevel(document.createElement("audio"), true, envOf(fake.context)))
    expect(fake.raw.resume).toHaveBeenCalled()
  })

  it("reuses one context and one source for the same element across plays", () => {
    const fake = fakeContext()
    const element = document.createElement("audio")
    const create = vi.fn(() => fake.context)
    const { rerender } = renderHook(({ active }) => useAudioLevel(element, active, { createContext: create }), {
      initialProps: { active: true },
    })
    rerender({ active: false })
    rerender({ active: true })
    expect(create).toHaveBeenCalledTimes(1)
    expect(fake.raw.createMediaElementSource).toHaveBeenCalledTimes(1)
  })

  it("closes the context on unmount", () => {
    const fake = fakeContext()
    const { unmount } = renderHook(() => useAudioLevel(document.createElement("audio"), true, envOf(fake.context)))
    expect(fake.raw.close).not.toHaveBeenCalled()
    unmount()
    expect(fake.raw.close).toHaveBeenCalledTimes(1)
  })

  it("does nothing, and does not throw, where there is no Web Audio", () => {
    const { result } = renderHook(() => useAudioLevel(document.createElement("audio"), true, envOf(null)))
    expect(result.current()).toBe(0)
  })

  it("reads 0 when the graph cannot be built (an element already tied to another context)", () => {
    const fake = fakeContext()
    fake.raw.createMediaElementSource.mockImplementation(() => {
      throw new Error("InvalidStateError")
    })
    const { result } = renderHook(() => useAudioLevel(document.createElement("audio"), true, envOf(fake.context)))
    expect(result.current()).toBe(0)
  })

  it("gives the same reader on every render, so a render loop can hold on to it", () => {
    const fake = fakeContext()
    const element = document.createElement("audio")
    const { result, rerender } = renderHook(() => useAudioLevel(element, true, envOf(fake.context)))
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})
