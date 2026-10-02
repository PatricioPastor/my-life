export type RecordViewFailure = "no_session" | "not_countable" | "unavailable"

/**
 * What `recordMemoryView` answers. `counted` is true when this visitor had not opened the memory before (the shown
 * count went up by one), false for a repeat open. Safe to import anywhere (no server code); the client ignores every
 * failure: a view that is not recorded changes nothing on screen.
 */
export type RecordViewResult = { ok: true; counted: boolean } | { ok: false; reason: RecordViewFailure }
