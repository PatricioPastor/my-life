export const PLACE_NAME_MAX_LENGTH = 120
export const PLACE_ADDRESS_MAX_LENGTH = 200

/** Plain text for the database: control characters removed, whitespace collapsed, at most `max` code points. */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const clean = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (clean === "") return null
  return [...clean].slice(0, max).join("").trim() || null
}

/**
 * A short, plain place name for the database: control characters removed, whitespace collapsed, at most 120
 * characters (counted as code points, like the column's intent). Null when nothing usable is left.
 */
export function cleanPlaceName(value: unknown): string | null {
  return cleanText(value, PLACE_NAME_MAX_LENGTH)
}

/** The same for a street address ("Av. Rivadavia 1234, Junín"): at most 200 characters, like its column. */
export function cleanPlaceAddress(value: unknown): string | null {
  return cleanText(value, PLACE_ADDRESS_MAX_LENGTH)
}
