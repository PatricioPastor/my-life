import type { MemoryView } from "../memory-view"

export type ShareFailure = "no_session" | "not_shareable" | "unavailable"

/** What `shareMemory` answers: the absolute link, or why there is none. Safe to import anywhere (no server code). */
export type ShareMemoryResult = { ok: true; url: string } | { ok: false; reason: ShareFailure }

/** What a guest lookup answers. Every failure is a redirect to the start, so the reasons only help the logs and tests. */
export type SharedMemoryResult =
  | { ok: true; memory: MemoryView }
  | { ok: false; reason: "invalid" | "not_found" | "unavailable" }
