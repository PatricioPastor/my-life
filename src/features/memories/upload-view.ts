import type { MemoryValidationError } from "./validate-new-memory"
import type { MemoryView } from "./memory-view"

/** Everything the browser needs for one direct Cloudinary upload. No secret is ever in here. */
export interface UploadGrant {
  cloudName: string
  /** The signed form fields (including `api_key` and `signature`), to be sent as they are next to the file. */
  fields: Record<string, string>
  /** Proves to `createMemory` that the server issued this upload to this visitor. */
  ticket: string
}

export type PrepareUploadFailure = "no_session" | "unavailable" | "rate_limited"
export type PrepareUploadResult = { ok: true; upload: UploadGrant } | { ok: false; reason: PrepareUploadFailure }

export interface CreateMemoryInput {
  ticket: string
  caption: string
  /** `YYYY-MM-DD`, the visitor calendar date. */
  happenedOn: string
  /**
   * The visitor ticked "Guardar desde dónde fue". Only an explicit `true` counts; the server alone decides what
   * is stored (an approximate location, and only when the photo has valid GPS).
   */
  shareLocation: boolean
}

export type CreateMemoryFailure =
  | "no_session"
  | "invalid_ticket"
  | "rate_limited"
  | "asset_missing"
  | "asset_type"
  | "asset_too_large"
  | "duplicate"
  | "unavailable"

export type CreateMemoryResult =
  | { ok: true; memory: MemoryView }
  | { ok: false; reason: "invalid"; errors: MemoryValidationError[] }
  | { ok: false; reason: CreateMemoryFailure }
