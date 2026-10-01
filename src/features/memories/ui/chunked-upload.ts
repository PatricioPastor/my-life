import type { UploadFields } from "../upload-view"
import { CHUNK_SIZE, planChunks } from "./chunk-plan"

export type ChunkedUploadResult = { ok: true } | { ok: false; reason: "failed" | "cancelled" }

/** One chunk, ready to post: the signed fields plus the `file` part, and the two headers that make it a chunk. */
export interface ChunkRequest {
  url: string
  headers: Record<string, string>
  form: FormData
  /** Bytes of this chunk sent so far. */
  onProgress: (loaded: number) => void
  signal?: AbortSignal
}

/**
 * How one chunk went. `retry`: the connection failed or Cloudinary was busy or erroring (worth another go);
 * `fatal`: an answer a retry cannot fix (a bad signature, a file too big); `cancelled`: the request was aborted.
 */
export type ChunkResponse = { kind: "ok" } | { kind: "retry" } | { kind: "fatal" } | { kind: "cancelled" }

export type SendChunk = (request: ChunkRequest) => Promise<ChunkResponse>

/** The most attempts for one chunk (the first and three retries). */
const MAX_ATTEMPTS = 4

/** Wait before retrying after attempt `n` (1-based) failed: 1 s, 2 s, 4 s, then at most 8 s. */
export const backoffMs = (attempt: number): number => Math.min(1000 * 2 ** (attempt - 1), 8000)

export interface ChunkedUploadOptions {
  file: Blob
  /** The name sent with each part. */
  name?: string
  /** The Cloudinary upload endpoint. */
  url: string
  /** The signed fields the server prepared: the same, untouched, on every chunk. */
  fields: UploadFields
  /** A whole percentage, 0 to 100, of the bytes of the whole file. Never goes down. */
  onProgress: (percent: number) => void
  signal?: AbortSignal
  send: SendChunk
  /** Waits `ms`; resolves early when the signal aborts. A seam for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  chunkSize?: number
  /** The `X-Unique-Upload-Id`, one per file. A fresh one is made when it is not given. */
  uploadId?: string
}

const newUploadId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal?.addEventListener("abort", done, { once: true })
  })

/**
 * Uploads a file to Cloudinary in chunks, one after the other. Every chunk is the same POST with the same signed fields
 * (the signature covers the fields, not the bytes, and stays valid for an hour) and the same unique upload id, and
 * claims its byte range in `Content-Range`. A chunk that does not get through is retried (bounded, with a growing wait)
 * with the very same range, so one dropped connection costs one chunk, not the file. Progress is the bytes of the whole
 * file; cancelling stops the chunk in flight and sends no more.
 */
export async function uploadInChunks({
  file,
  name,
  url,
  fields,
  onProgress,
  signal,
  send,
  sleep = wait,
  chunkSize = CHUNK_SIZE,
  uploadId = newUploadId(),
}: ChunkedUploadOptions): Promise<ChunkedUploadResult> {
  if (signal?.aborted) return { ok: false, reason: "cancelled" }
  const chunks = planChunks(file.size, chunkSize)
  let confirmed = 0
  let shown = -1
  // The bar only moves forward: a retried chunk starts over from zero, and the visitor does not see it.
  const report = (bytes: number, final = false) => {
    const percent = final ? 100 : Math.min(99, Math.round((bytes / file.size) * 100))
    if (percent > shown) {
      shown = percent
      onProgress(percent)
    }
  }

  for (const chunk of chunks) {
    for (let attempt = 1; ; attempt++) {
      if (signal?.aborted) return { ok: false, reason: "cancelled" }
      const form = new FormData()
      for (const [key, value] of Object.entries(fields)) form.append(key, value)
      const part = file.slice(chunk.start, chunk.end + 1)
      if (name !== undefined) form.append("file", part, name)
      else form.append("file", part)

      const response = await send({
        url,
        headers: { "X-Unique-Upload-Id": uploadId, "Content-Range": chunk.contentRange },
        form,
        onProgress: (loaded) => report(confirmed + Math.min(Math.max(loaded, 0), chunk.size)),
        signal,
      })

      if (response.kind === "ok") break
      if (response.kind === "cancelled") return { ok: false, reason: "cancelled" }
      if (response.kind === "fatal" || attempt >= MAX_ATTEMPTS) return { ok: false, reason: "failed" }
      await sleep(backoffMs(attempt), signal)
    }
    confirmed += chunk.size
    report(confirmed, confirmed === file.size)
  }
  return { ok: true }
}
