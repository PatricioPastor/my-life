const COUNT_FORMAT = new Intl.NumberFormat("es")

/**
 * "1 vista" / "12 vistas" (thousands grouped the Spanish way: "12.345 vistas"), or null at zero: a memory nobody has opened
 * shows no count at all. Anything that cannot be a count (negative, fractional, not finite) says nothing either.
 */
export function formatViewCount(count: number): string | null {
  if (!Number.isInteger(count) || count <= 0) return null
  return `${COUNT_FORMAT.format(count)} ${count === 1 ? "vista" : "vistas"}`
}
