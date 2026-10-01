import { describe, expect, it } from "vitest"
import {
  EDGE_THRESHOLD,
  MAX_EDGES_PER_NODE,
  buildEdges,
  dateAffinity,
  placeAffinity,
  similarity,
  type Relatable,
} from "./similarity"

const mem = (id: string, happenedOn: string, over: Partial<Relatable> = {}): Relatable => ({
  id,
  happenedOn,
  takenAt: null,
  place: null,
  ...over,
})
const at = (lat: number, lng: number, name: string | null = null) => ({ lat, lng, name })

describe("dateAffinity", () => {
  const base = mem("a", "2024-03-12")

  it("ranks the same day above the same week, the same week above the same month, and a stranger month at zero", () => {
    const sameDay = dateAffinity(base, mem("b", "2024-03-12"))
    const sameWeek = dateAffinity(base, mem("b", "2024-03-17"))
    const sameMonth = dateAffinity(base, mem("b", "2024-03-30"))
    const far = dateAffinity(base, mem("b", "2024-06-12"))
    expect(sameDay).toBe(1)
    expect(sameDay).toBeGreaterThan(sameWeek)
    expect(sameWeek).toBeGreaterThan(sameMonth)
    expect(sameMonth).toBeGreaterThan(0)
    expect(far).toBe(0)
  })

  it("fades inside the week: a day apart is closer than seven", () => {
    expect(dateAffinity(base, mem("b", "2024-03-13"))).toBeGreaterThan(dateAffinity(base, mem("b", "2024-03-19")))
  })

  it("counts a week that crosses a month boundary", () => {
    expect(dateAffinity(mem("a", "2024-03-30"), mem("b", "2024-04-03"))).toBeGreaterThan(0.4)
  })

  it("is symmetric", () => {
    const b = mem("b", "2024-03-15")
    expect(dateAffinity(base, b)).toBe(dateAffinity(b, base))
  })

  it("prefers the photo's own moment (takenAt) over the date the visitor typed", () => {
    const typed = mem("a", "2024-03-12", { takenAt: "2023-08-10T15:00:00.000Z" })
    expect(dateAffinity(typed, mem("b", "2023-08-10"))).toBe(1)
    expect(dateAffinity(typed, mem("c", "2024-03-12"))).toBe(0)
  })

  it("falls back to the typed date when takenAt is unreadable, and to nothing when both are", () => {
    const broken = mem("a", "2024-03-12", { takenAt: "nope" })
    expect(dateAffinity(broken, mem("b", "2024-03-12"))).toBe(1)
    expect(dateAffinity(mem("x", "garbage"), mem("y", "garbage"))).toBe(0)
  })
})

describe("placeAffinity", () => {
  it("is zero when either memory has no place", () => {
    expect(placeAffinity(mem("a", "2024-01-01"), mem("b", "2024-01-01", { place: at(1, 1, "X") }))).toBe(0)
    expect(placeAffinity(mem("a", "2024-01-01"), mem("b", "2024-01-01"))).toBe(0)
  })

  it("is strong for the same place name, wherever the coarse coordinates fall", () => {
    const a = mem("a", "2024-01-01", { place: at(-34.59, -58.42, "Palermo, Buenos Aires") })
    const b = mem("b", "2024-01-01", { place: at(-34.62, -58.46, " palermo, buenos aires ") })
    expect(placeAffinity(a, b)).toBe(1)
  })

  it("is strong within about a kilometre, medium within about 25, and zero beyond", () => {
    const a = mem("a", "2024-01-01", { place: at(-34.6, -58.4) })
    const metres = (lat: number) => mem("b", "2024-01-01", { place: at(lat, -58.4) })
    expect(placeAffinity(a, metres(-34.6))).toBe(1)
    // 0.01 degree of latitude is about 1.1 km: the next cell over still counts as the same spot.
    expect(placeAffinity(a, metres(-34.61))).toBe(1)
    // 0.1 degree is about 11 km.
    expect(placeAffinity(a, metres(-34.7))).toBe(0.5)
    // 1 degree is about 111 km.
    expect(placeAffinity(a, metres(-35.6))).toBe(0)
  })

  it("does not match two unnamed places by name alone", () => {
    const a = mem("a", "2024-01-01", { place: at(10, 10, null) })
    const b = mem("b", "2024-01-01", { place: at(40, 40, null) })
    expect(placeAffinity(a, b)).toBe(0)
  })
})

describe("similarity", () => {
  const place = at(-34.6, -58.4, "Centro")

  it("is 0..1, symmetric and zero for strangers", () => {
    const a = mem("a", "2024-03-12", { place })
    const b = mem("b", "2021-11-02", { place: at(48.85, 2.35, "París") })
    expect(similarity(a, b)).toBe(0)
    const c = mem("c", "2024-03-12", { place })
    expect(similarity(a, c)).toBeGreaterThan(0)
    expect(similarity(a, c)).toBeLessThanOrEqual(1)
    expect(similarity(a, c)).toBe(similarity(c, a))
  })

  it("rewards sharing both the day and the place more than either alone", () => {
    const a = mem("a", "2024-03-12", { place })
    const both = similarity(a, mem("b", "2024-03-12", { place }))
    const dayOnly = similarity(a, mem("c", "2024-03-12"))
    const placeOnly = similarity(a, mem("d", "2019-01-01", { place }))
    expect(both).toBeGreaterThan(dayOnly)
    expect(both).toBeGreaterThan(placeOnly)
  })

  it("does not link memories on a shared month alone, but links a shared week or a nearby town", () => {
    const a = mem("a", "2024-03-02")
    expect(similarity(a, mem("b", "2024-03-28"))).toBeLessThan(EDGE_THRESHOLD)
    expect(similarity(a, mem("b", "2024-03-06"))).toBeGreaterThanOrEqual(EDGE_THRESHOLD)
    const town = mem("c", "2020-01-01", { place: at(-34.6, -58.4) })
    expect(similarity(town, mem("d", "2023-01-01", { place: at(-34.7, -58.4) }))).toBeGreaterThanOrEqual(EDGE_THRESHOLD)
  })
})

describe("buildEdges", () => {
  it("links related memories by index, once each, never to themselves", () => {
    const edges = buildEdges([mem("a", "2024-03-12"), mem("b", "2024-03-12"), mem("c", "2020-01-01")])
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ a: 0, b: 1 })
    expect(edges[0].weight).toBeGreaterThanOrEqual(EDGE_THRESHOLD)
    expect(edges[0].weight).toBeLessThanOrEqual(1)
  })

  it("drops pairs below the threshold", () => {
    expect(buildEdges([mem("a", "2024-03-02"), mem("b", "2024-03-28")])).toEqual([])
  })

  it("is empty for zero or one memory", () => {
    expect(buildEdges([])).toEqual([])
    expect(buildEdges([mem("a", "2024-01-01")])).toEqual([])
  })

  it("caps the edges per node and keeps the strongest ones", () => {
    const place = at(-34.6, -58.4, "Centro")
    // Ten memories on one day: a hairball if every pair were linked. Memory 0 also shares its place with
    // memory 9 only, so the (0, 9) pair is the strongest one it has.
    const items = Array.from({ length: 10 }, (_, i) =>
      mem(`m${i}`, "2024-03-12", i === 0 || i === 9 ? { place } : {}),
    )
    const edges = buildEdges(items)
    const degree = new Array(items.length).fill(0)
    for (const e of edges) {
      degree[e.a]++
      degree[e.b]++
    }
    expect(Math.max(...degree)).toBeLessThanOrEqual(MAX_EDGES_PER_NODE)
    expect(edges.some((e) => e.a === 0 && e.b === 9)).toBe(true)
    // It still connects: no memory of the crowd is left out.
    expect(Math.min(...degree)).toBeGreaterThan(0)
  })

  it("honours a custom cap and threshold", () => {
    const items = Array.from({ length: 6 }, (_, i) => mem(`m${i}`, "2024-03-12"))
    const edges = buildEdges(items, { maxPerNode: 2 })
    const degree = new Array(items.length).fill(0)
    for (const e of edges) {
      degree[e.a]++
      degree[e.b]++
    }
    expect(Math.max(...degree)).toBeLessThanOrEqual(2)
    expect(buildEdges(items, { threshold: 1.1 })).toEqual([])
  })

  it("is deterministic and ordered strongest first", () => {
    const items = [
      mem("a", "2024-03-12"),
      mem("b", "2024-03-14"),
      mem("c", "2024-03-12"),
      mem("d", "2024-03-15", { place: at(1, 1, "X") }),
      mem("e", "2024-03-15", { place: at(1, 1, "X") }),
    ]
    const first = buildEdges(items)
    expect(buildEdges(items)).toEqual(first)
    for (let i = 1; i < first.length; i++) expect(first[i - 1].weight).toBeGreaterThanOrEqual(first[i].weight)
  })
})
