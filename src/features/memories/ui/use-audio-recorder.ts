"use client"

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { MAX_AUDIO_BYTES, MAX_AUDIO_MS } from "../upload-limits"
import {
  INITIAL_RECORDER,
  errorFromName,
  fileNameFor,
  pickRecorderMime,
  recorderReducer,
  type RecorderState,
} from "./audio-recorder-model"

/** The part of `MediaRecorder` this hook uses, so a test can stand in for it. */
export interface RecorderLike {
  readonly state: string
  readonly mimeType: string
  ondataavailable: ((event: { data: Blob }) => void) | null
  onstop: (() => void) | null
  onerror: ((event: unknown) => void) | null
  /** `timeslice`: deliver the audio in chunks of about this many milliseconds, instead of all of it at the end. */
  start(timeslice?: number): void
  stop(): void
}

export interface RecorderConstructor {
  new (stream: MediaStream, options?: { mimeType?: string }): RecorderLike
  isTypeSupported?: (type: string) => boolean
}

/** What the browser gives the recorder, as seams: the microphone, `MediaRecorder` and a clock (milliseconds). */
export interface RecorderEnv {
  /** Missing where the page has no microphone API (an insecure page, an old browser). */
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  /** Missing where there is no `MediaRecorder`: the form then only offers to upload a file. */
  recorder?: RecorderConstructor
  now: () => number
}

export function browserRecorderEnv(): RecorderEnv {
  const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined
  return {
    getUserMedia: media && typeof media.getUserMedia === "function" ? (constraints) => media.getUserMedia(constraints) : undefined,
    recorder: typeof MediaRecorder !== "undefined" ? (MediaRecorder as unknown as RecorderConstructor) : undefined,
    now: () => performance.now(),
  }
}

/** The audio held by the form: a recording or a picked file, with the object URL it plays from. */
export interface RecordedClip {
  blob: Blob
  /** The name it is uploaded under. */
  name: string
  /** An object URL, revoked when the clip goes. */
  url: string
}

interface Session {
  recorder: RecorderLike
  stream: MediaStream
  timer: number
  /** Thrown away on purpose (discarded or unmounted): its data is dropped. */
  discarded: boolean
}

/**
 * The clock only shows whole seconds, and an hour of ticks every 100 ms would render the form 36,000 times: twice a second
 * is plenty, and the cap still lands within half a second.
 */
const TICK_MS = 500
/** How often the browser hands over the audio recorded so far, so an hour is never one huge buffer built at the end. */
const TIMESLICE_MS = 2000

function release(session: Session) {
  window.clearInterval(session.timer)
  for (const track of session.stream.getTracks()) track.stop()
}

/**
 * Container logic for recording a voice in the browser. Asks for the microphone, records with `MediaRecorder` in the
 * best container the browser can (webm/opus, or mp4 on Safari) and receives it in 2 second chunks, stops at 60 minutes
 * (or the size cap) by itself and keeps the take as a named clip with an object URL: the chunks are joined into one Blob,
 * which is uploaded as it is (never read, encoded or copied). It also holds an uploaded file the same way, so the form has one audio either way.
 * The state machine is pure (`recorderReducer`); this hook only does the side effects and cleans up after them: it
 * stops the tracks, clears the timer, closes nothing it does not own and revokes every object URL it made.
 */
export function useAudioRecorder(env?: RecorderEnv) {
  const [environment] = useState<RecorderEnv>(() => env ?? browserRecorderEnv())
  const [state, dispatch] = useReducer(recorderReducer, INITIAL_RECORDER)
  const [clip, setClip] = useState<RecordedClip | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  /** Bytes received so far in this take: the approximate size shown while recording. */
  const [sizeBytes, setSizeBytes] = useState(0)
  const session = useRef<Session | null>(null)
  const pending = useRef(false)
  /** Bumped to abandon a request that is still waiting for the microphone. */
  const attempt = useRef(0)
  const clipUrl = useRef<string | null>(null)

  const releaseUrl = useCallback(() => {
    if (clipUrl.current) URL.revokeObjectURL(clipUrl.current)
    clipUrl.current = null
  }, [])

  const hold = useCallback(
    (blob: Blob, name: string) => {
      releaseUrl()
      const url = URL.createObjectURL(blob)
      clipUrl.current = url
      setClip({ blob, name, url })
    },
    [releaseUrl],
  )

  /** Ends the current take without keeping it. Safe to call with nothing recording. */
  const abandon = useCallback(() => {
    attempt.current += 1
    pending.current = false
    const current = session.current
    session.current = null
    if (!current) return
    current.discarded = true
    release(current)
    if (current.recorder.state !== "inactive") {
      try {
        current.recorder.stop()
      } catch {
        // Already stopped: nothing to flush.
      }
    }
  }, [])

  useEffect(
    () => () => {
      abandon()
      releaseUrl()
    },
    [abandon, releaseUrl],
  )

  const supported = Boolean(environment.getUserMedia && environment.recorder)

  const start = useCallback(async () => {
    const { getUserMedia, recorder: Recorder } = environment
    if (!getUserMedia || !Recorder) {
      dispatch({ type: "failed", error: "unsupported" })
      return
    }
    if (pending.current || session.current) return
    const mine = ++attempt.current
    pending.current = true
    // Recording again over a held audio starts over.
    releaseUrl()
    setClip(null)
    setSizeBytes(0)
    dispatch({ type: "request" })

    let media: MediaStream
    try {
      media = await getUserMedia({ audio: true })
    } catch (error) {
      if (mine !== attempt.current) return
      pending.current = false
      dispatch({ type: "failed", error: errorFromName((error as { name?: string } | null)?.name) })
      return
    }
    // The visitor gave up (or closed the form) while the browser was asking: let the microphone go.
    if (mine !== attempt.current) {
      for (const track of media.getTracks()) track.stop()
      return
    }
    pending.current = false

    const mime = pickRecorderMime(Recorder.isTypeSupported ? (type) => Recorder.isTypeSupported!(type) : undefined)
    let recorder: RecorderLike
    try {
      recorder = new Recorder(media, mime ? { mimeType: mime } : undefined)
    } catch {
      for (const track of media.getTracks()) track.stop()
      dispatch({ type: "failed", error: "failed" })
      return
    }

    const chunks: Blob[] = []
    let received = 0
    const startedAt = environment.now()
    const current: Session = { recorder, stream: media, timer: 0, discarded: false }
    const stopCurrent = () => {
      if (recorder.state !== "inactive") recorder.stop()
    }

    recorder.ondataavailable = (event) => {
      if (event?.data && event.data.size > 0) {
        chunks.push(event.data)
        received += event.data.size
        if (!current.discarded) setSizeBytes(received)
      }
    }
    recorder.onerror = () => {
      release(current)
      if (session.current !== current) return
      session.current = null
      setStream(null)
      dispatch({ type: "failed", error: "failed" })
    }
    recorder.onstop = () => {
      release(current)
      if (current.discarded || session.current !== current) return
      session.current = null
      setStream(null)
      const type = recorder.mimeType || mime || "audio/webm"
      const blob = new Blob(chunks, { type })
      if (blob.size === 0) {
        dispatch({ type: "failed", error: "failed" })
        return
      }
      hold(blob, fileNameFor(type))
      dispatch({ type: "stopped", durationMs: Math.min(environment.now() - startedAt, MAX_AUDIO_MS) })
    }

    session.current = current
    setStream(media)
    recorder.start(TIMESLICE_MS)
    dispatch({ type: "started" })
    current.timer = window.setInterval(() => {
      const elapsed = environment.now() - startedAt
      dispatch({ type: "tick", elapsedMs: elapsed })
      if (elapsed >= MAX_AUDIO_MS || received >= MAX_AUDIO_BYTES) stopCurrent()
    }, TICK_MS)
  }, [environment, hold, releaseUrl])

  const stop = useCallback(() => {
    const current = session.current
    if (current && current.recorder.state !== "inactive") current.recorder.stop()
  }, [])

  const discard = useCallback(() => {
    abandon()
    setStream(null)
    releaseUrl()
    setClip(null)
    setSizeBytes(0)
    dispatch({ type: "discard" })
  }, [abandon, releaseUrl])

  /** Holds a picked file as the audio. Ignored while a recording is in progress. */
  const load = useCallback(
    (file: File, durationMs: number | null) => {
      if (session.current || pending.current) return
      hold(file, file.name)
      dispatch({ type: "loaded", durationMs })
    },
    [hold],
  )

  /** Handlers for the `<audio>` element that plays the clip back, so the state follows what is heard. */
  const playback = useMemo(
    () => ({
      onPlay: () => dispatch({ type: "play" }),
      onPause: () => dispatch({ type: "pause" }),
      onEnded: () => dispatch({ type: "ended" }),
    }),
    [],
  )

  return { state: state as RecorderState, supported, clip, stream, sizeBytes, start, stop, discard, load, playback }
}
