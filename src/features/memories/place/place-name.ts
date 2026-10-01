export const PLACE_NAME_MAX_LENGTH = 120

/**
 * A short, plain place name for the database: control characters removed, whitespace collapsed, at most 120
 * characters (counted as code points, like the column's intent). Null when nothing usable is left.
 */
export function cleanPlaceName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const clean = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (clean === "") return null
  return [...clean].slice(0, PLACE_NAME_MAX_LENGTH).join("").trim() || null
}
