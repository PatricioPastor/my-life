const MAX_HANDLE = 30
const HANDLE_PATTERN = /^[a-z0-9._]{1,30}$/

/** Instagram-style handle: no leading @, no whitespace, lowercase, capped. */
export function normalizeHandle(raw: string): string {
  return String(raw ?? "")
    .replace(/\s+/g, "")
    .replace(/^@+/, "")
    .toLowerCase()
    .slice(0, MAX_HANDLE)
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle)
}
