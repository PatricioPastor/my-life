export type MemoryStatus = "pending" | "approved" | "rejected"

/** A photo, a short caption and the date it happened, uploaded by an admitted visitor. */
export interface Memory {
  id: string
  /** The visitor's Instagram handle (normalized). */
  handle: string
  /** Cloudinary public id of the photo. */
  publicId: string
  caption: string
  /** Calendar date the memory happened, as UTC midnight. */
  happenedOn: Date
  width: number
  height: number
  status: MemoryStatus
  createdAt: Date
}

/** What a visitor submits. The handle comes from the session, never from this input. */
export interface NewMemory {
  publicId: string
  caption: string
  happenedOn: Date
  width: number
  height: number
}

/** Unvalidated input, same shape as {@link NewMemory}. */
export type NewMemoryInput = NewMemory

export const CAPTION_MAX_LENGTH = 140
export const EARLIEST_MEMORY_DATE = new Date("1900-01-01T00:00:00.000Z")
