"use client"

import { useEffect, useState } from "react"

/**
 * An audio is made playable once, in the background, after it is uploaded (Cloudinary `eager_async`); for a long one
 * that takes a while. Until then our audio route answers 503 with `X-Audio-State: processing`. This is how the player
 * finds out, and how it asks again later without hammering the server.
 */
export type AudioReadiness = "checking" | "ready" | "processing" | "unavailable"

/** The player's Spanish copy for it (neutral, `tú`). Quiet: it is not an error, the audio is on its way. */
export const AUDIO_READINESS_COPY = {
  processing: "Procesando audio…",
  unavailable: "Audio no disponible",
} as const

/** The wait before each retry while it is processing: about 5 minutes in all, then it gives up (until `retry()`). */
export const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 30_000, 30_000, 30_000, 30_000, 30_000, 30_000, 30_000, 30_000, 30_000]

/**
 * One cheap look at the audio: its first byte. `ready` on a 200 or 206; `processing` when the route says it is still
 * being made; `unavailable` for anything else (gone, not allowed, a failing Cloudinary, no network).
 */
export async function probeAudio(
  url: string,
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<"ready" | "processing" | "unavailable"> {
  try {
    const response = await fetchFn(url, { headers: { Range: "bytes=0-0" }, signal, cache: "no-store" })
    void response.body?.cancel().catch(() => undefined)
    if (response.status === 200 || response.status === 206) return "ready"
    if (response.status === 503 && response.headers.get("x-audio-state") === "processing") return "processing"
    return "unavailable"
  } catch {
    return "unavailable"
  }
}

interface Checked {
  url: string
  run: number
  status: Exclude<AudioReadiness, "checking">
}

/**
 * Whether the audio at `url` can be played yet. Container logic: it looks once, and while the answer is "processing"
 * looks again with a growing wait (bounded: see {@link RETRY_DELAYS_MS}). `retry()` starts over after it gave up.
 * With no `url` there is nothing to wait for, so it is `ready`.
 */
export function useAudioReadiness(url: string | null, options?: { fetch?: typeof fetch }) {
  const [run, setRun] = useState(0)
  const [checked, setChecked] = useState<Checked | null>(null)
  // A test seam, taken once: a new function on every render must not restart the check.
  const [fetchFn] = useState(() => options?.fetch)

  useEffect(() => {
    if (!url) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()

    const check = async (attempt: number) => {
      const result = await probeAudio(url, fetchFn, controller.signal)
      if (cancelled) return
      if (result === "processing" && attempt < RETRY_DELAYS_MS.length) {
        setChecked({ url, run, status: "processing" })
        timer = setTimeout(() => void check(attempt + 1), RETRY_DELAYS_MS[attempt])
        return
      }
      setChecked({ url, run, status: result === "processing" ? "unavailable" : result })
    }
    void check(0)

    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [url, run, fetchFn])

  const status: AudioReadiness = !url ? "ready" : checked && checked.url === url && checked.run === run ? checked.status : "checking"
  return { status, retry: () => setRun((n) => n + 1) }
}
