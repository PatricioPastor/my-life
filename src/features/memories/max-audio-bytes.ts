import "server-only"
import { ABSOLUTE_MAX_AUDIO_BYTES, MAX_AUDIO_BYTES } from "./upload-limits"

/** Below this a cap cannot hold any audio worth the name: a typo, not a choice. */
const MIN_AUDIO_BYTES = 1_000_000

/**
 * The most an audio may weigh on this server: `MEMORY_MAX_AUDIO_BYTES` (a whole number of bytes, read server-side
 * only) when it is set and valid, otherwise the Cloudinary plan maximum. Anything that is not a plain positive
 * integer, or is too small to be meant, is ignored; a value above what the database accepts is lowered to it.
 */
export function readMaxAudioBytes(env: Record<string, string | undefined> = process.env): number {
  const raw = env.MEMORY_MAX_AUDIO_BYTES?.trim()
  if (!raw || !/^\d+$/.test(raw)) return MAX_AUDIO_BYTES
  const value = Number(raw)
  if (!Number.isFinite(value) || value < MIN_AUDIO_BYTES) return MAX_AUDIO_BYTES
  return Math.min(value, ABSOLUTE_MAX_AUDIO_BYTES)
}
