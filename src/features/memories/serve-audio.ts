import "server-only"
import { cloudinaryAudioUrl } from "./cloudinary-url"
import type { DeliveryConfig } from "./list-memories"
import type { MemoryRepository } from "./memory-repository"

export interface ServeAudioDeps {
  currentVisitor: () => Promise<{ handle: string } | null>
  /** Lazy, so building it (which runs the runtime-role guard) happens inside the failure handling. */
  repository: () => MemoryRepository
  /** Null when a variable is missing. The secret only signs the delivery URL; it never leaves the server. */
  cloudinary: DeliveryConfig | null
  fetch: typeof fetch
  /** One short line, never with personal data or a URL. */
  log: (message: string) => void
}

/**
 * The most bytes one response carries. A browser asks for `bytes=N-` and reads on; capping the window keeps each request
 * short (a function has a time limit, a phone a poor connection) and the player simply asks for the next one. A server
 * may answer less than asked as long as `Content-Range` says what it sent.
 */
export const MAX_SLICE_BYTES = 8 * 1024 * 1024

/** Seconds a browser should wait before asking again while the audio is still being made. */
const RETRY_AFTER_SECONDS = 10

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ByteRange = { start: number; end: number | null } | { suffix: number }

/**
 * One `Range: bytes=...` header: `a-b`, `a-` or `-n`. Anything else (several ranges, another unit, a malformed or empty
 * one) is `null`, and the whole audio is sent: a server may ignore a range it does not understand.
 */
export function parseRange(header: string | null): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "")
  if (!match) return null
  const [, from, to] = match
  if (from === "" && to === "") return null
  if (from === "") {
    const suffix = Number(to)
    return suffix > 0 ? { suffix } : null
  }
  const start = Number(from)
  if (to === "") return { start, end: null }
  const end = Number(to)
  return end >= start ? { start, end } : null
}

/** The `Range` header to send Cloudinary: the browser's, clamped to a window of {@link MAX_SLICE_BYTES}. */
function upstreamRange(range: ByteRange): string {
  if ("suffix" in range) return `bytes=-${Math.min(range.suffix, MAX_SLICE_BYTES)}`
  const last = range.start + MAX_SLICE_BYTES - 1
  return `bytes=${range.start}-${range.end === null ? last : Math.min(range.end, last)}`
}

/** The bytes a range means in a file of `total` bytes (clamped to the window), or null when none are left. */
function resolveRange(range: ByteRange, total: number): { start: number; end: number } | null {
  let start: number
  let end: number
  if ("suffix" in range) {
    start = Math.max(total - Math.min(range.suffix, MAX_SLICE_BYTES), 0)
    end = total - 1
  } else {
    start = range.start
    end = Math.min(range.end ?? Number.POSITIVE_INFINITY, total - 1, start + MAX_SLICE_BYTES - 1)
  }
  return start >= total || end < start ? null : { start, end }
}

/** `length` bytes of `source` from byte `start`, read once and in order; the rest is never read. */
function sliceStream(source: ReadableStream<Uint8Array>, start: number, length: number): ReadableStream<Uint8Array> {
  const reader = source.getReader()
  let skipped = 0
  let sent = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return controller.close()
        let chunk = value
        if (skipped < start) {
          const skip = Math.min(start - skipped, chunk.length)
          skipped += skip
          chunk = chunk.subarray(skip)
        }
        if (chunk.length === 0) continue
        const take = Math.min(chunk.length, length - sent)
        controller.enqueue(chunk.subarray(0, take))
        sent += take
        if (sent >= length) {
          controller.close()
          void reader.cancel().catch(() => undefined)
        }
        return
      }
    },
    cancel: (reason) => reader.cancel(reason),
  })
}

const fail = (status: number, extra: Record<string, string> = {}) =>
  new Response(null, { status, headers: { "Cache-Control": "no-store", ...extra } })

/**
 * The audio of a memory, streamed from Cloudinary with byte ranges, so it plays and seeks on Safari and iOS (which need
 * a 206 and `Accept-Ranges`). The visitor must have a session, and the memory is read as them under row-level security,
 * so only an approved memory or their own pending one is ever served. The signed Cloudinary URL stays on the server:
 * the browser sees only our route.
 *
 * The audio is the mp3 transcode that `eager_async` makes at upload. Until it exists Cloudinary answers 423 (a derivative
 * in the making) or, for a large file it will not transcode on the fly, a 400 that says so in `X-Cld-Error`: both become
 * a 503 with `Retry-After`, so the player can say "processing" and ask again later. If Cloudinary ignores `Range` and
 * sends everything, the range is cut here.
 */
export async function serveAudioWith(
  deps: ServeAudioDeps,
  input: { id: string; range: string | null; signal?: AbortSignal },
): Promise<Response> {
  const cloudinary = deps.cloudinary
  let publicId: string
  try {
    const visitor = await deps.currentVisitor()
    if (!visitor) return fail(401)
    if (!UUID.test(input.id)) return fail(404)
    if (!cloudinary?.cloudName || !cloudinary.apiSecret) {
      deps.log("Cloudinary is not configured.")
      return fail(503)
    }
    const memory = await deps.repository().findForVisitor(visitor.handle, input.id)
    if (!memory || memory.status === "rejected" || !memory.audio) return fail(404)
    publicId = memory.audio.publicId
  } catch (error) {
    // The name only: messages from the database layer can carry query parameters.
    deps.log(`Reading a memory's audio failed (${error instanceof Error ? error.name : "unknown"}).`)
    return fail(503)
  }

  const range = parseRange(input.range)
  let upstream: Response
  try {
    const url = cloudinaryAudioUrl(cloudinary.cloudName, publicId, cloudinary.apiSecret)
    upstream = await deps.fetch(url, {
      headers: range ? { Range: upstreamRange(range) } : {},
      signal: input.signal,
      cache: "no-store",
    })
  } catch (error) {
    // The name only: the message could carry the signed URL.
    deps.log(`Fetching an audio from Cloudinary failed (${error instanceof Error ? error.name : "unknown"}).`)
    return fail(502)
  }

  const cldError = upstream.headers.get("x-cld-error") ?? ""
  if (upstream.status === 423 || /pending|too large to process|processing/i.test(cldError)) {
    void upstream.body?.cancel().catch(() => undefined)
    return fail(503, { "Retry-After": String(RETRY_AFTER_SECONDS), "X-Audio-State": "processing" })
  }
  if (upstream.status === 404) return fail(404)
  if (upstream.status === 416) {
    const total = /\/(\d+)$/.exec(upstream.headers.get("content-range") ?? "")?.[1]
    return fail(416, total ? { "Content-Range": `bytes */${total}` } : {})
  }
  if (!upstream.ok) {
    deps.log(`Cloudinary answered ${upstream.status} for an audio.`)
    void upstream.body?.cancel().catch(() => undefined)
    return fail(502)
  }

  // Only what the player needs: never Cloudinary's own headers (cookies, request ids, a Location).
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": "audio/mpeg",
    // Approved memories are the same for everyone, pending ones are the owner's: private either way.
    "Cache-Control": "private, max-age=3600",
  })

  if (upstream.status === 206) {
    for (const name of ["content-range", "content-length"]) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    return new Response(upstream.body, { status: 206, headers })
  }

  const total = Number(upstream.headers.get("content-length"))
  if (range && upstream.body && Number.isInteger(total) && total > 0) {
    // Cloudinary sent everything although a range was asked for: cut it here.
    const part = resolveRange(range, total)
    if (!part) {
      void upstream.body.cancel().catch(() => undefined)
      return fail(416, { "Content-Range": `bytes */${total}` })
    }
    headers.set("Content-Range", `bytes ${part.start}-${part.end}/${total}`)
    headers.set("Content-Length", String(part.end - part.start + 1))
    return new Response(sliceStream(upstream.body, part.start, part.end - part.start + 1), { status: 206, headers })
  }

  const length = upstream.headers.get("content-length")
  if (length) headers.set("Content-Length", length)
  return new Response(upstream.body, { status: 200, headers })
}
