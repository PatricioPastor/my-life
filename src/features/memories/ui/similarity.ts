/** What the constellation needs to know about a memory to relate it to another. */
export interface Relatable {
  id: string
  /** `YYYY-MM-DD`, the date the visitor typed. */
  happenedOn: string
  /** ISO 8601 UTC from the photo's EXIF, or null. Preferred over `happenedOn` when it parses. */
  takenAt: string | null
  /** A coarse position (2 decimals) and the place name, or null. */
  place: { lat: number; lng: number; name: string | null } | null
  /** The memory this one was contributed from, when the visitor can see it: an explicit relation. */
  relatedId?: string | null
}

/**
 * A link between two memories, by index into the list they came from. `a < b`; `weight` is in the threshold..1 range.
 * An `explicit` one is a relation the visitor made (a memory contributed from another): full strength, always kept, and
 * drawn and pulled harder than a similarity edge.
 */
export interface Edge {
  a: number
  b: number
  weight: number
  explicit?: boolean
}

/** Pairs scoring under this never become edges. */
export const EDGE_THRESHOLD = 0.35
/** The most edges one memory keeps, so a crowded day never becomes a hairball. */
export const MAX_EDGES_PER_NODE = 4

// How much each kind of evidence can contribute on its own (a perfect match scores this much).
const DATE_WEIGHT = 0.85
const PLACE_WEIGHT = 0.85

const DAY_MS = 86_400_000
const WEEK_DAYS = 7
// Inside the week the affinity fades from a day apart to a full week apart; a shared month is a faint tie.
const WEEK_NEAR = 0.7
const WEEK_FAR = 0.45
const MONTH_AFFINITY = 0.2

// The positions are rounded to 2 decimals (about 1.1 km), so "the same spot" has to allow the next cell over.
const SAME_SPOT_KM = 1.5
const NEARBY_KM = 25
const NEARBY_AFFINITY = 0.5
const EARTH_KM = 6371

/** The calendar day (UTC, days since the epoch) of a memory: the photo's own moment when it has one. */
function dayOf(m: Relatable): number | null {
  const taken = m.takenAt ? Date.parse(m.takenAt) : Number.NaN
  if (Number.isFinite(taken)) return Math.floor(taken / DAY_MS)
  const typed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(m.happenedOn)
  if (!typed) return null
  const ms = Date.UTC(Number(typed[1]), Number(typed[2]) - 1, Number(typed[3]))
  return Number.isFinite(ms) ? Math.floor(ms / DAY_MS) : null
}

const monthKey = (day: number) => {
  const d = new Date(day * DAY_MS)
  return d.getUTCFullYear() * 12 + d.getUTCMonth()
}

/** 0..1: the same day is 1, then the same week fades from 0.7 to 0.45, then the same month is a faint 0.2. */
export function dateAffinity(a: Relatable, b: Relatable): number {
  const da = dayOf(a)
  const db = dayOf(b)
  if (da === null || db === null) return 0
  const gap = Math.abs(da - db)
  if (gap === 0) return 1
  if (gap <= WEEK_DAYS) return WEEK_NEAR - ((gap - 1) / (WEEK_DAYS - 1)) * (WEEK_NEAR - WEEK_FAR)
  return monthKey(da) === monthKey(db) ? MONTH_AFFINITY : 0
}

const rad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle distance in km (haversine). */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

const nameKey = (name: string | null) => name?.trim().toLowerCase() ?? ""

/** 0..1: the same place name or about a kilometre is 1, about 25 km is 0.5, anything else (or no place) is 0. */
export function placeAffinity(a: Relatable, b: Relatable): number {
  if (!a.place || !b.place) return 0
  const name = nameKey(a.place.name)
  if (name !== "" && name === nameKey(b.place.name)) return 1
  const km = distanceKm(a.place, b.place)
  if (km <= SAME_SPOT_KM) return 1
  return km <= NEARBY_KM ? NEARBY_AFFINITY : 0
}

/** 0..1: the date and the place combine as independent evidence, so sharing both beats sharing either. */
export function similarity(a: Relatable, b: Relatable): number {
  const date = dateAffinity(a, b) * DATE_WEIGHT
  const place = placeAffinity(a, b) * PLACE_WEIGHT
  return 1 - (1 - date) * (1 - place)
}

interface EdgeOptions {
  threshold?: number
  maxPerNode?: number
}

/**
 * The explicit relations of a list, as edges of full strength: one per related pair, `a < b`, in index order. A relation
 * to a memory that is not in the list, or to itself, is ignored.
 */
function explicitEdges(items: readonly Relatable[]): Edge[] {
  const indexOf = new Map(items.map((item, index) => [item.id, index]))
  const seen = new Set<number>()
  const found: Edge[] = []
  for (let from = 0; from < items.length; from++) {
    const related = items[from].relatedId
    const to = related ? indexOf.get(related) : undefined
    if (to === undefined || to === from) continue
    const a = Math.min(from, to)
    const b = Math.max(from, to)
    const key = a * items.length + b
    if (seen.has(key)) continue
    seen.add(key)
    found.push({ a, b, weight: 1, explicit: true })
  }
  return found.sort((p, q) => p.a - q.a || p.b - q.b)
}

/**
 * The links of a list. The explicit relations come first and are always kept, whatever the threshold or the cap. Then
 * every other pair is scored once (O(n^2), done once per list change, fine for hundreds of memories); pairs under the
 * threshold are dropped, and the rest are taken strongest first while both ends still have room, so no memory keeps more
 * than `maxPerNode` edges (an explicit one counts toward that room, so it leaves less for similarity). A pair that is
 * already related is not linked twice. Ties break by index, so it is deterministic.
 */
export function buildEdges(items: readonly Relatable[], options: EdgeOptions = {}): Edge[] {
  const threshold = options.threshold ?? EDGE_THRESHOLD
  const cap = options.maxPerNode ?? MAX_EDGES_PER_NODE
  const related = explicitEdges(items)
  const taken = new Set(related.map((edge) => edge.a * items.length + edge.b))
  const candidates: Edge[] = []
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      if (taken.has(a * items.length + b)) continue
      const weight = similarity(items[a], items[b])
      if (weight >= threshold) candidates.push({ a, b, weight })
    }
  }
  candidates.sort((p, q) => q.weight - p.weight || p.a - q.a || p.b - q.b)
  const degree = new Array<number>(items.length).fill(0)
  for (const edge of related) {
    degree[edge.a]++
    degree[edge.b]++
  }
  const kept: Edge[] = [...related]
  for (const edge of candidates) {
    if (degree[edge.a] >= cap || degree[edge.b] >= cap) continue
    degree[edge.a]++
    degree[edge.b]++
    kept.push(edge)
  }
  return kept
}
