import { cleanPlaceName } from "./place-name"

/**
 * Port: turns a rounded position into a short human place label such as "Palermo, Buenos Aires". Adapters never
 * throw: any failure is `null`, because a missing label must never block anything.
 */
export interface ReverseGeocoder {
  reverse(lat: number, lng: number): Promise<string | null>
}

/** The part of Nominatim's `address` object the label uses. Other fields are ignored. */
export type AddressParts = Record<string, unknown>

const AREA_KEYS = ["neighbourhood", "suburb", "quarter", "city_district"] as const
const CITY_KEYS = ["city", "town", "village", "municipality", "hamlet"] as const

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null)
const firstOf = (address: AddressParts, keys: readonly string[]) => {
  for (const key of keys) {
    const found = text(address[key])
    if (found) return found
  }
  return null
}

/**
 * Composes the label: neighbourhood or suburb plus the city; otherwise the city plus the country; otherwise the
 * state plus the country. Streets and house numbers are never used. Null when there is nothing usable.
 */
export function composePlaceLabel(address: AddressParts | null | undefined): string | null {
  if (!address || typeof address !== "object") return null
  const area = firstOf(address, AREA_KEYS)
  const city = firstOf(address, CITY_KEYS)
  const country = text(address.country)
  const state = text(address.state)

  let parts: Array<string | null>
  if (area && city) parts = [area, city]
  else if (city) parts = [city, country]
  else if (area) parts = [area, country]
  else if (state) parts = [state, country]
  else parts = [country]

  const unique = parts.filter((part, index): part is string => part !== null && parts.indexOf(part) === index)
  return cleanPlaceName(unique.join(", "))
}
