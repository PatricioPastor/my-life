import type { UploadFields } from "../upload-view"
import { needsChunking } from "./chunk-plan"
import { uploadInChunks, type ChunkRequest, type ChunkResponse } from "./chunked-upload"

export type UploadResult = { ok: true } | { ok: false; reason: "failed" | "cancelled" }

export type UploadToCloudinary = (options: {
  /** The photo, the picked audio, or a recording. */
  file: Blob
  /** The name sent with the file; a recorded blob has none of its own. */
  name?: string
  cloudName: string
  /** The signed form fields the server prepared (including `api_key` and `signature`), sent as they are. */
  fields: UploadFields
  /** Where Cloudinary keeps it: a photo is an `image`, an audio is a `video` (it stores audio as video). */
  resource: "image" | "video"
  /** A whole percentage, 0 to 100. */
  onProgress: (percent: number) => void
  signal?: AbortSignal
}) => Promise<UploadResult>

/** What a chunk answered, in terms of what to do next: only a busy or failing Cloudinary is worth another try. */
export function classifyStatus(status: number): ChunkResponse {
  if (status >= 200 && status < 300) return { kind: "ok" }
  return status === 408 || status === 429 || status >= 500 ? { kind: "retry" } : { kind: "fatal" }
}

/** One chunk over XHR (not `fetch`, which cannot report upload progress). Aborting the signal cuts it. */
function sendChunk({ url, headers, form, onProgress, signal }: ChunkRequest): Promise<ChunkResponse> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ kind: "cancelled" })
    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    const finish = (response: ChunkResponse) => {
      signal?.removeEventListener("abort", abort)
      resolve(response)
    }
    xhr.open("POST", url)
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded)
    }
    xhr.onload = () => finish(classifyStatus(xhr.status))
    xhr.onerror = () => finish({ kind: "retry" })
    xhr.ontimeout = () => finish({ kind: "retry" })
    xhr.onabort = () => finish({ kind: "cancelled" })
    signal?.addEventListener("abort", abort, { once: true })
    xhr.send(form)
  })
}

/**
 * Sends one file straight to Cloudinary with the signed fields the server prepared. XHR rather than `fetch`
 * because it reports upload progress. Aborting the signal cancels the request.
 *
 * A file above about 20 MB (a long audio) goes in 6 MB chunks instead, with a retry per chunk and one aggregated
 * progress (see `uploadInChunks`): the same signed fields ride on every chunk. The Blob is sliced and posted as it
 * is; nothing is read into memory or encoded.
 */
export const uploadToCloudinary: UploadToCloudinary = ({ file, name, cloudName, fields, resource, onProgress, signal }) => {
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resource}/upload`
  if (needsChunking(file.size)) return uploadInChunks({ file, name, url, fields, onProgress, signal, send: sendChunk })

  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ ok: false, reason: "cancelled" })

    const body = new FormData()
    for (const [key, value] of Object.entries(fields)) body.append(key, value)
    if (name !== undefined) body.append("file", file, name)
    else body.append("file", file)

    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    const finish = (result: UploadResult) => {
      signal?.removeEventListener("abort", abort)
      resolve(result)
    }
    xhr.open("POST", url)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300 ? { ok: true } : { ok: false, reason: "failed" })
    xhr.onerror = () => finish({ ok: false, reason: "failed" })
    xhr.ontimeout = () => finish({ ok: false, reason: "failed" })
    xhr.onabort = () => finish({ ok: false, reason: "cancelled" })
    signal?.addEventListener("abort", abort, { once: true })
    xhr.send(body)
  })
}
