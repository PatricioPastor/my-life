import type { UploadGrant } from "../upload-view"

export type UploadResult = { ok: true } | { ok: false; reason: "failed" | "cancelled" }

export type UploadToCloudinary = (options: {
  file: File
  grant: UploadGrant
  /** A whole percentage, 0 to 100. */
  onProgress: (percent: number) => void
  signal?: AbortSignal
}) => Promise<UploadResult>

/**
 * Sends the photo straight to Cloudinary with the signed fields the server prepared. XHR rather than `fetch`
 * because it reports upload progress. Aborting the signal cancels the request.
 */
export const uploadToCloudinary: UploadToCloudinary = ({ file, grant, onProgress, signal }) =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve({ ok: false, reason: "cancelled" })

    const body = new FormData()
    for (const [key, value] of Object.entries(grant.fields)) body.append(key, value)
    body.append("file", file)

    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    const finish = (result: UploadResult) => {
      signal?.removeEventListener("abort", abort)
      resolve(result)
    }
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${encodeURIComponent(grant.cloudName)}/image/upload`)
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
