/** Small pure decisions behind the audio player of the glass: its times, its remembered volume, and which keys it takes. */

import { formatClock } from "./glass-mode"

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const seconds = (value: number) => (Number.isFinite(value) ? Math.max(value, 0) : 0)

/** "3:12 de 15:32": where the voice is and how long it is, as a screen reader should say it (`aria-valuetext`). */
export function scrubText(elapsed: number, total: number): string {
  const end = seconds(total)
  const at = Math.min(seconds(elapsed), end)
  return `${formatClock(at * 1000)} de ${formatClock(end * 1000)}`
}

/** The time to seek to for a value from the scrubber: inside the voice, and the start for anything that is not a time. */
export function seekTarget(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total)) return 0
  return clamp(value, 0, Math.max(total, 0))
}

/** How much of the track has played, as a percentage for the filled part of the scrubber. */
export function fillPercent(elapsed: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(elapsed)) return 0
  return clamp((elapsed / total) * 100, 0, 100)
}

export interface VolumePref {
  /** The level the visitor chose, 0 to 1. */
  volume: number
  muted: boolean
}

const FULL: VolumePref = { volume: 1, muted: false }

/** What actually comes out: the chosen level, or nothing while muted. */
export const effectiveVolume = (pref: VolumePref): number => (pref.muted ? 0 : pref.volume)

/** "70 %", or "Silenciado": the volume slider's `aria-valuetext`. */
export function volumeText(pref: VolumePref): string {
  return effectiveVolume(pref) === 0 ? "Silenciado" : `${Math.round(pref.volume * 100)} %`
}

type ReadableStorage = Pick<Storage, "getItem">
type WritableStorage = Pick<Storage, "setItem">

export const VOLUME_KEY = "mem-player-volume"

const browserStorage = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

/** The volume kept from an earlier visit: full volume when nothing usable is stored, or storage is blocked. */
export function loadVolume(storage: ReadableStorage | null = browserStorage()): VolumePref {
  try {
    const raw = storage?.getItem(VOLUME_KEY)
    if (!raw) return FULL
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return FULL
    const { volume, muted } = parsed as { volume?: unknown; muted?: unknown }
    return {
      volume: typeof volume === "number" && Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : 1,
      muted: muted === true,
    }
  } catch {
    return FULL
  }
}

/** Keeps the volume for the next visit. Storage may be blocked or full: then it is simply not kept. */
export function saveVolume(pref: VolumePref, storage: WritableStorage | null = browserStorage()): void {
  try {
    storage?.setItem(VOLUME_KEY, JSON.stringify(pref))
  } catch {
    // Not kept beyond this page: the session copy below still holds it.
  }
}

let session: VolumePref | null = null

/**
 * The volume for this page session: read once from storage, then held in memory, so it carries from one memory to the
 * next even where storage is blocked. Given a new value it holds it and saves it. Returns the current volume.
 */
export function rememberVolume(next?: VolumePref, storage?: (ReadableStorage & WritableStorage) | null): VolumePref {
  if (next) {
    session = next
    saveVolume(next, storage)
  }
  session ??= loadVolume(storage)
  return session
}

/** Forgets the session's volume (a test starts from nothing). */
export function resetVolumeSession(): void {
  session = null
}

/** Where typing, or a slider, owns the keys: a text field, a range input, anything marked as a slider or editable. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest("input, textarea, select, [role='slider'], [contenteditable]:not([contenteditable='false'])")) return true
  return false
}

/**
 * Whether a key press should play or pause the voice: Space or K, with no modifier, when typing or a slider does not own
 * the key. A focused button or link keeps Space (it presses that control), but K is ours wherever it lands.
 */
export function wantsToggle(event: {
  key: string
  target: EventTarget | null
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  if (event.key !== " " && event.key.toLowerCase() !== "k") return false
  if (isTypingTarget(event.target)) return false
  if (event.key === " " && event.target instanceof Element && event.target.closest("button, a[href]")) return false
  return true
}
