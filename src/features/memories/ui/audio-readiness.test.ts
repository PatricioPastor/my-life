import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AUDIO_READINESS_COPY, RETRY_DELAYS_MS, probeAudio, useAudioReadiness } from "./audio-readiness"

const URL = "/api/memories/11111111-1111-4111-8111-111111111111/audio"
const res = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers })
const processing = () => res(503, { "x-audio-state": "processing", "retry-after": "10" })

describe("probeAudio", () => {
  it("asks for the first byte only, and answers ready on a 206 or a 200", async () => {
    const fetchFn = vi.fn(async () => res(206))
    expect(await probeAudio(URL, fetchFn as unknown as typeof fetch)).toBe("ready")
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(URL)
    expect(new Headers(init.headers).get("range")).toBe("bytes=0-0")
    expect(await probeAudio(URL, (async () => res(200)) as unknown as typeof fetch)).toBe("ready")
  })

  it("answers processing when the route says the audio is still being made", async () => {
    expect(await probeAudio(URL, (async () => processing()) as unknown as typeof fetch)).toBe("processing")
  })

  it.each([401, 404, 500, 502, 503])("answers unavailable on a %s that is not the processing state", async (status) => {
    expect(await probeAudio(URL, (async () => res(status)) as unknown as typeof fetch)).toBe("unavailable")
  })

  it("answers unavailable when the request itself fails", async () => {
    const failing = (async () => {
      throw new TypeError("network")
    }) as unknown as typeof fetch
    expect(await probeAudio(URL, failing)).toBe("unavailable")
  })
})

describe("useAudioReadiness", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)))

  it("says it is processing, quietly, then ready once a retry finds the audio", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(processing())
      .mockResolvedValueOnce(processing())
      .mockResolvedValueOnce(res(206))
    const { result } = renderHook(() => useAudioReadiness(URL, { fetch: fetchFn as unknown as typeof fetch }))
    expect(result.current.status).toBe("checking")
    await flush()
    expect(result.current.status).toBe("processing")
    await act(async () => void (await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0])))
    expect(result.current.status).toBe("processing")
    await act(async () => void (await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[1])))
    expect(result.current.status).toBe("ready")
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it("is ready at once when the audio is", async () => {
    const { result } = renderHook(() => useAudioReadiness(URL, { fetch: (async () => res(206)) as unknown as typeof fetch }))
    await flush()
    expect(result.current.status).toBe("ready")
  })

  it("backs off between retries and stops after a bounded number, then says it is unavailable", async () => {
    const fetchFn = vi.fn(async () => processing())
    const { result } = renderHook(() => useAudioReadiness(URL, { fetch: fetchFn as unknown as typeof fetch }))
    await flush()
    for (const delay of RETRY_DELAYS_MS) await act(async () => void (await vi.advanceTimersByTimeAsync(delay)))
    expect(fetchFn).toHaveBeenCalledTimes(1 + RETRY_DELAYS_MS.length)
    expect(result.current.status).toBe("unavailable")
    await act(async () => void (await vi.advanceTimersByTimeAsync(10 * 60_000)))
    expect(fetchFn).toHaveBeenCalledTimes(1 + RETRY_DELAYS_MS.length)
    expect(RETRY_DELAYS_MS.every((d, i) => i === 0 || d >= RETRY_DELAYS_MS[i - 1])).toBe(true)
  })

  it("does not retry an audio that is simply gone", async () => {
    const fetchFn = vi.fn(async () => res(404))
    const { result } = renderHook(() => useAudioReadiness(URL, { fetch: fetchFn as unknown as typeof fetch }))
    await flush()
    expect(result.current.status).toBe("unavailable")
    await act(async () => void (await vi.advanceTimersByTimeAsync(60_000)))
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("starts over on demand after giving up", async () => {
    const fetchFn = vi.fn(async () => res(502))
    const { result } = renderHook(() => useAudioReadiness(URL, { fetch: fetchFn as unknown as typeof fetch }))
    await flush()
    expect(result.current.status).toBe("unavailable")
    fetchFn.mockResolvedValue(res(206))
    act(() => result.current.retry())
    await flush()
    expect(result.current.status).toBe("ready")
  })

  it("checks nothing without an audio, and stops when it is unmounted", async () => {
    const fetchFn = vi.fn(async () => processing())
    const none = renderHook(() => useAudioReadiness(null, { fetch: fetchFn as unknown as typeof fetch }))
    await flush()
    expect(fetchFn).not.toHaveBeenCalled()
    expect(none.result.current.status).toBe("ready")

    const { unmount } = renderHook(() => useAudioReadiness(URL, { fetch: fetchFn as unknown as typeof fetch }))
    await flush()
    unmount()
    await act(async () => void (await vi.advanceTimersByTimeAsync(60_000)))
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("speaks in neutral Spanish", () => {
    expect(AUDIO_READINESS_COPY.processing).toBe("Procesando audio…")
    expect(AUDIO_READINESS_COPY.unavailable).toBe("Audio no disponible")
  })
})
