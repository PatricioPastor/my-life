import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MAX_AUDIO_BYTES, MAX_AUDIO_MS } from "../upload-limits"
import { useAudioRecorder, type RecorderEnv } from "./use-audio-recorder"

type Handler = ((event?: unknown) => void) | null

class FakeRecorder {
  static instances: FakeRecorder[] = []
  static supported = new Set<string>(["audio/webm;codecs=opus", "audio/mp4"])
  static isTypeSupported = (type: string) => FakeRecorder.supported.has(type)
  /** What stop() delivers, as a real recorder does when it flushes. */
  static data = "voice-bytes"
  state: "inactive" | "recording" = "inactive"
  mimeType: string
  ondataavailable: Handler = null
  onstop: Handler = null
  onerror: Handler = null
  stop = vi.fn(() => {
    this.state = "inactive"
    if (FakeRecorder.data) this.ondataavailable?.({ data: new Blob([FakeRecorder.data], { type: this.mimeType }) })
    this.onstop?.()
  })
  start = vi.fn(() => {
    this.state = "recording"
  })
  constructor(
    readonly stream: MediaStream,
    readonly options?: { mimeType?: string },
  ) {
    this.mimeType = options?.mimeType ?? "audio/webm"
    FakeRecorder.instances.push(this)
  }
}

const tracks = () => [{ stop: vi.fn() }, { stop: vi.fn() }]
let granted: ReturnType<typeof tracks>

function env(over: Partial<RecorderEnv> = {}): RecorderEnv {
  return {
    getUserMedia: vi.fn(async () => ({ getTracks: () => granted }) as unknown as MediaStream),
    recorder: FakeRecorder as unknown as RecorderEnv["recorder"],
    now: () => Date.now(),
    ...over,
  }
}

const urls = { create: vi.fn(), revoke: vi.fn() }

beforeEach(() => {
  vi.useFakeTimers()
  FakeRecorder.instances = []
  FakeRecorder.data = "voice-bytes"
  FakeRecorder.supported = new Set(["audio/webm;codecs=opus", "audio/mp4"])
  granted = tracks()
  let n = 0
  urls.create.mockReset().mockImplementation(() => `blob:clip-${++n}`)
  urls.revoke.mockReset()
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: urls.create, revokeObjectURL: urls.revoke }))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const start = (result: { current: ReturnType<typeof useAudioRecorder> }) =>
  act(async () => {
    await result.current.start()
  })

describe("useAudioRecorder: recording", () => {
  it("asks for the microphone only, then records", async () => {
    const e = env()
    const { result } = renderHook(() => useAudioRecorder(e))
    expect(result.current.state.phase).toBe("idle")
    await start(result)
    expect(e.getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(result.current.state.phase).toBe("recording")
    expect(FakeRecorder.instances[0].start).toHaveBeenCalled()
  })

  it("exposes the live stream while recording, and not after", async () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    expect(result.current.stream).not.toBeNull()
    act(() => result.current.stop())
    expect(result.current.stream).toBeNull()
  })

  it("chooses the best container the browser can record", async () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    expect(FakeRecorder.instances[0].options).toEqual({ mimeType: "audio/webm;codecs=opus" })

    cleanup()
    FakeRecorder.instances = []
    FakeRecorder.supported = new Set(["audio/mp4"])
    const safari = renderHook(() => useAudioRecorder(env()))
    await start(safari.result)
    expect(FakeRecorder.instances[0].options).toEqual({ mimeType: "audio/mp4" })
  })

  it("lets the browser pick when it supports none of ours", async () => {
    FakeRecorder.supported = new Set()
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    expect(FakeRecorder.instances[0].options).toBeUndefined()
  })

  it("counts the time while recording", async () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current.state.elapsedMs).toBeGreaterThanOrEqual(2900)
    expect(result.current.state.elapsedMs).toBeLessThanOrEqual(3100)
  })

  it("stops, keeps the recording as a named clip with an object URL, and releases the microphone", async () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    act(() => {
      vi.advanceTimersByTime(4200)
    })
    act(() => result.current.stop())
    expect(result.current.state.phase).toBe("recorded")
    expect(result.current.state.source).toBe("recording")
    expect(result.current.state.durationMs).toBeGreaterThanOrEqual(4100)
    const clip = result.current.clip
    expect(clip).not.toBeNull()
    expect(clip!.blob.size).toBe(FakeRecorder.data.length)
    expect(clip!.blob.type).toBe("audio/webm;codecs=opus")
    expect(clip!.name).toBe("recuerdo.webm")
    expect(clip!.url).toBe("blob:clip-1")
    for (const track of granted) expect(track.stop).toHaveBeenCalled()
  })

  it("names an mp4 recording as m4a", async () => {
    FakeRecorder.supported = new Set(["audio/mp4"])
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    act(() => result.current.stop())
    expect(result.current.clip!.name).toBe("recuerdo.m4a")
  })

  it("records with a timeslice, so the browser hands the audio over in small chunks while it goes", async () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    expect(FakeRecorder.instances[0].start).toHaveBeenCalledTimes(1)
    expect(FakeRecorder.instances[0].start).toHaveBeenCalledWith(2000)
  })

  it("keeps the MIME it picked: webm/opus first, mp4 on Safari", async () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    expect(FakeRecorder.instances[0].options).toEqual({ mimeType: "audio/webm;codecs=opus" })
    FakeRecorder.supported = new Set(["audio/mp4"])
    act(() => result.current.discard())
    await start(result)
    expect(FakeRecorder.instances[1].options).toEqual({ mimeType: "audio/mp4" })
  })

  it("counts the bytes as the chunks arrive, for the size shown while recording", async () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    expect(result.current.sizeBytes).toBe(0)
    await start(result)
    act(() => FakeRecorder.instances[0].ondataavailable?.({ data: new Blob([new Uint8Array(1500)]) }))
    act(() => FakeRecorder.instances[0].ondataavailable?.({ data: new Blob([new Uint8Array(500)]) }))
    expect(result.current.sizeBytes).toBe(2000)
  })

  it("starts counting again for a new take", async () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    act(() => FakeRecorder.instances[0].ondataavailable?.({ data: new Blob([new Uint8Array(1500)]) }))
    act(() => result.current.discard())
    expect(result.current.sizeBytes).toBe(0)
    await start(result)
    expect(result.current.sizeBytes).toBe(0)
  })

  it("does not hold the whole recording as base64 or text: the clip is the Blob itself, joined from the chunks", async () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    const first = new Blob([new Uint8Array(10)], { type: "audio/webm" })
    const second = new Blob([new Uint8Array(20)], { type: "audio/webm" })
    act(() => FakeRecorder.instances[0].ondataavailable?.({ data: first }))
    act(() => FakeRecorder.instances[0].ondataavailable?.({ data: second }))
    FakeRecorder.data = ""
    act(() => result.current.stop())
    expect(result.current.clip!.blob).toBeInstanceOf(Blob)
    expect(result.current.clip!.blob.size).toBe(30)
  })

  it("stops by itself when the recording reaches the size cap, before the time one", async () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    act(() => FakeRecorder.instances[0].ondataavailable?.({ data: { size: MAX_AUDIO_BYTES } as Blob }))
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(FakeRecorder.instances[0].stop).toHaveBeenCalledTimes(1)
  })

  it("does not wake the form more than twice a second: an hour of ticks at 10 Hz would render 36,000 times", async () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    const setInterval = vi.spyOn(window, "setInterval")
    act(() => result.current.discard())
    await start(result)
    expect(setInterval.mock.calls.at(-1)?.[1]).toBeGreaterThanOrEqual(500)
  })

  it("stops by itself at 60 minutes, and never keeps more", async () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    act(() => {
      vi.advanceTimersByTime(MAX_AUDIO_MS + 3000)
    })
    expect(FakeRecorder.instances[0].stop).toHaveBeenCalledTimes(1)
    expect(result.current.state.phase).toBe("recorded")
    expect(result.current.state.durationMs).toBe(MAX_AUDIO_MS)
  })

  it("treats a recording with no data as a failure", async () => {
    FakeRecorder.data = ""
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    act(() => result.current.stop())
    expect(result.current.state).toMatchObject({ phase: "idle", error: "failed" })
    expect(result.current.clip).toBeNull()
  })

  it("fails cleanly when the recorder reports an error", async () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    act(() => FakeRecorder.instances[0].onerror?.({}))
    expect(result.current.state).toMatchObject({ phase: "idle", error: "failed" })
    for (const track of granted) expect(track.stop).toHaveBeenCalled()
  })
})

describe("useAudioRecorder: when the microphone is not available", () => {
  it.each([
    ["NotAllowedError", "denied"],
    ["NotFoundError", "no_device"],
    ["NotReadableError", "failed"],
  ])("reports %s as %s and goes back to idle without recording", async (name, error) => {
    const e = env({
      getUserMedia: vi.fn(async () => {
        throw Object.assign(new Error("nope"), { name })
      }),
    })
    const { result } = renderHook(() => useAudioRecorder(e))
    await start(result)
    expect(result.current.state).toMatchObject({ phase: "idle", error })
    expect(FakeRecorder.instances).toHaveLength(0)
  })

  it("is not supported without MediaRecorder, or without getUserMedia, and says so when asked to record", async () => {
    for (const bare of [env({ recorder: undefined }), env({ getUserMedia: undefined })]) {
      const { result, unmount } = renderHook(() => useAudioRecorder(bare))
      expect(result.current.supported).toBe(false)
      await start(result)
      expect(result.current.state).toMatchObject({ phase: "idle", error: "unsupported" })
      unmount()
    }
  })

  it("is supported when both exist", () => {
    expect(renderHook(() => useAudioRecorder(env())).result.current.supported).toBe(true)
  })

  it("releases a stream that was granted after the visitor gave up waiting", async () => {
    let grant: (stream: MediaStream) => void = () => {}
    const e = env({ getUserMedia: vi.fn(() => new Promise<MediaStream>((resolve) => (grant = resolve))) })
    const { result } = renderHook(() => useAudioRecorder(e))
    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.start()
    })
    act(() => result.current.discard())
    await act(async () => {
      grant({ getTracks: () => granted } as unknown as MediaStream)
      await pending
    })
    expect(result.current.state.phase).toBe("idle")
    expect(FakeRecorder.instances).toHaveLength(0)
    for (const track of granted) expect(track.stop).toHaveBeenCalled()
  })
})

describe("useAudioRecorder: discarding, re-recording and files", () => {
  it("discards a recording: no clip, the object URL revoked", async () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    act(() => result.current.stop())
    act(() => result.current.discard())
    expect(result.current.state.phase).toBe("idle")
    expect(result.current.clip).toBeNull()
    expect(urls.revoke).toHaveBeenCalledWith("blob:clip-1")
  })

  it("discarding while recording throws the take away and releases the microphone", async () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    act(() => result.current.discard())
    expect(result.current.state.phase).toBe("idle")
    expect(result.current.clip).toBeNull()
    expect(urls.create).not.toHaveBeenCalled()
    for (const track of granted) expect(track.stop).toHaveBeenCalled()
  })

  it("records again over a recording: the old URL goes, a new clip comes", async () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    act(() => result.current.stop())
    granted = tracks()
    await start(result)
    expect(urls.revoke).toHaveBeenCalledWith("blob:clip-1")
    expect(result.current.clip).toBeNull()
    act(() => result.current.stop())
    expect(result.current.clip!.url).toBe("blob:clip-2")
  })

  it("holds an uploaded file as the audio, with its length", () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    const file = new File(["x"], "nota.mp3", { type: "audio/mpeg" })
    act(() => result.current.load(file, 9000))
    expect(result.current.state).toMatchObject({ phase: "recorded", source: "file", durationMs: 9000 })
    expect(result.current.clip).toMatchObject({ blob: file, name: "nota.mp3", url: "blob:clip-1" })
  })

  it("replaces a held file with another, revoking the first URL", () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    act(() => result.current.load(new File(["a"], "a.mp3", { type: "audio/mpeg" }), 1000))
    act(() => result.current.load(new File(["b"], "b.mp3", { type: "audio/mpeg" }), 2000))
    expect(urls.revoke).toHaveBeenCalledWith("blob:clip-1")
    expect(result.current.clip!.name).toBe("b.mp3")
  })

  it("follows the audio element: play, pause and end", () => {
    const { result } = renderHook(() => useAudioRecorder(env()))
    act(() => result.current.load(new File(["a"], "a.mp3", { type: "audio/mpeg" }), 1000))
    act(() => result.current.playback.onPlay())
    expect(result.current.state.phase).toBe("playing")
    act(() => result.current.playback.onPause())
    expect(result.current.state.phase).toBe("recorded")
    act(() => result.current.playback.onPlay())
    act(() => result.current.playback.onEnded())
    expect(result.current.state.phase).toBe("recorded")
  })
})

describe("useAudioRecorder: cleanup", () => {
  it("on unmount stops a recording in progress, releases the microphone and clears the timer", async () => {
    const { result, unmount } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    unmount()
    for (const track of granted) expect(track.stop).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(urls.create).not.toHaveBeenCalled()
  })

  it("on unmount revokes the object URL of a held clip", async () => {
    const { result, unmount } = renderHook(() => useAudioRecorder(env()))
    await start(result)
    act(() => result.current.stop())
    unmount()
    expect(urls.revoke).toHaveBeenCalledWith("blob:clip-1")
  })
})
