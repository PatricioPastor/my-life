/**
 * Cloudinary's chunked upload, planned: how a file is cut and what range each piece claims (Cloudinary, "Upload images
 * and videos" > "Manual chunked upload": every chunk is a POST with `X-Unique-Upload-Id` and
 * `Content-Range: bytes <start>-<end>/<total>`, and every chunk but the last is larger than 5 MB). Pure.
 */

/** Cloudinary's floor: every chunk but the last must be larger than this. */
export const MIN_CHUNK_BYTES = 5_000_000
/** The chunk size used (6 MB: the figure of Cloudinary's own examples), comfortably above the floor. */
export const CHUNK_SIZE = 6_000_000
/**
 * Files above this are sent in chunks. Cloudinary only requires it above 100 MB, but a long upload on a phone network
 * is far more likely to finish when a dropped connection costs one 6 MB chunk and not the whole file.
 */
export const CHUNK_THRESHOLD_BYTES = 20_000_000

export interface Chunk {
  index: number
  /** First byte, inclusive. */
  start: number
  /** Last byte, inclusive. */
  end: number
  size: number
  /** The `Content-Range` header value. */
  contentRange: string
}

export const needsChunking = (bytes: number): boolean => bytes > CHUNK_THRESHOLD_BYTES

/** The chunks that cover `totalBytes` exactly, in order. Throws on an empty file or a chunk size Cloudinary refuses. */
export function planChunks(totalBytes: number, chunkSize: number = CHUNK_SIZE): Chunk[] {
  if (!Number.isInteger(totalBytes) || totalBytes <= 0) throw new Error("A chunked upload needs a file with bytes.")
  if (!Number.isInteger(chunkSize) || chunkSize <= MIN_CHUNK_BYTES) {
    throw new Error("Chunks must be larger than 5 MB.")
  }
  const chunks: Chunk[] = []
  for (let start = 0, index = 0; start < totalBytes; start += chunkSize, index++) {
    const end = Math.min(start + chunkSize, totalBytes) - 1
    chunks.push({ index, start, end, size: end - start + 1, contentRange: `bytes ${start}-${end}/${totalBytes}` })
  }
  return chunks
}
