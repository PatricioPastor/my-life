import { cleanPlaceAddress, cleanPlaceName } from "./place-name"

/** What a position is called: a short place name ("Palermo, Buenos Aires") and a street address ("Honduras 4000, Buenos Aires"). */
export interface PlaceDescription {
  /** Neighbourhood and city. Null when the geocoder named no area. */
  label: string | null
  /** Road and number, then the locality. Null when the geocoder named no road. */
  address: string | null
}

/**
 * Port: turns a position into what it is called. The position is the exact one (6 decimals): the visitor consented to
 * keeping the exact place and its address. Adapters never throw: any failure is `null`, because a missing description
 * must never block anything.
 */
export interface ReverseGeocoder {
  reverse(lat: number, lng: number): Promise<PlaceDescription | null>
}

/** The part of Nominatim's `address` object the label uses. Other fields are ignored. */
export type AddressParts = Record<string, unknown>

const AREA_KEYS = ["neighbourhood", "suburb", "quarter", "city_district"] as const
const CITY_KEYS = ["city", "town", "village", "municipality", "hamlet"] as const
/** What a street is called, in order of preference: a road first, then the ways a person walks. */
const ROAD_KEYS = ["road", "pedestrian", "footway", "path", "cycleway"] as const

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

/** "Avenida Rivadavia" is written "Av. Rivadavia"; nothing else is abbreviated. */
const shortRoad = (road: string) => road.replace(/^Avenida\s/, "Av. ")

/**
 * Composes the street address: the road and its house number ("Av. Rivadavia 1234"), then the locality (the city, town,
 * village, municipality or hamlet; else the neighbourhood). With no road there is no address (null): the place name
 * already says the area, and an address is never made up from a house number alone.
 */
export function composeAddress(address: AddressParts | null | undefined): string | null {
  if (!address || typeof address !== "object") return null
  const road = firstOf(address, ROAD_KEYS)
  if (!road) return null
  const number = text(address.house_number)
  const street = number ? `${shortRoad(road)} ${number}` : shortRoad(road)
  const locality = firstOf(address, CITY_KEYS) ?? firstOf(address, AREA_KEYS)
  const parts = [street, locality]
  const unique = parts.filter((part, index): part is string => part !== null && parts.indexOf(part) === index)
  return cleanPlaceAddress(unique.join(", "))
}

/** The label and the address of one Nominatim `address`, or null when neither can be made. */
export function describePlace(address: AddressParts | null | undefined): PlaceDescription | null {
  const label = composePlaceLabel(address)
  const street = composeAddress(address)
  return label === null && street === null ? null : { label, address: street }
}
