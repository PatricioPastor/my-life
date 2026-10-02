import { describe, expect, it } from "vitest"
import type { MemoryView } from "../memory-view"
import { RELATED_COPY, chipText, placeLine, relatedFrom } from "./related-memory"

const memory = (over: Partial<MemoryView> = {}): MemoryView => ({
  id: "r1",
  caption: "La casa nueva",
  happenedOn: "2023-07-04",
  status: "approved",
  width: 800,
  height: 600,
  kind: "image",
  takenAt: null,
  dominantColor: null,
  place: null,
  relatedId: null,
  orbColor: "#8ab4ff",
  viewCount: 0,
  thumbUrl: null,
  fullUrl: null,
  audio: null,
  ...over,
})

describe("relatedFrom", () => {
  it("keeps what the form needs: the id, the caption and the date it happened", () => {
    expect(relatedFrom(memory())).toEqual({ id: "r1", caption: "La casa nueva", happenedOn: "2023-07-04", place: null })
  })

  it("carries the place as the line the form shows, never the coordinates", () => {
    const related = relatedFrom(memory({ place: { lat: -34.59, lng: -58.43, name: "UOCRA", address: "Av. Rivadavia 1234, Junín" } }))
    expect(related.place).toBe("UOCRA · Av. Rivadavia 1234, Junín")
    expect(JSON.stringify(related)).not.toMatch(/34\.59|58\.43/)
  })
})

describe("placeLine", () => {
  it("is the name and the address, in that order", () => {
    expect(placeLine({ lat: 1, lng: 2, name: "UOCRA", address: "Av. Rivadavia 1234, Junín" })).toBe("UOCRA · Av. Rivadavia 1234, Junín")
  })

  it("is only the one that exists", () => {
    expect(placeLine({ lat: 1, lng: 2, name: "Palermo, Buenos Aires", address: null })).toBe("Palermo, Buenos Aires")
    expect(placeLine({ lat: 1, lng: 2, name: null, address: "Honduras 4000, Palermo" })).toBe("Honduras 4000, Palermo")
  })

  it("does not say the same thing twice", () => {
    expect(placeLine({ lat: 1, lng: 2, name: "Junín", address: "Av. Rivadavia 1234, Junín" })).toBe("Junín · Av. Rivadavia 1234, Junín")
    expect(placeLine({ lat: 1, lng: 2, name: "Plaza Italia", address: "plaza italia" })).toBe("Plaza Italia")
  })

  it("falls back to the coarse position when it has neither", () => {
    expect(placeLine({ lat: -34.59, lng: -58.42, name: null, address: null })).toBe("Cerca de -34.59, -58.42")
  })

  it("is null when there is no place", () => {
    expect(placeLine(null)).toBeNull()
  })
})

describe("chipText", () => {
  it("names the memory it is related to, in guillemets", () => {
    expect(chipText("La casa nueva")).toBe("Relacionado con «La casa nueva»")
  })

  it("shortens a long caption with an ellipsis", () => {
    const text = chipText("Una tarde larguísima en la que no paró de llover y terminamos cantando en la terraza hasta tarde")
    expect(text.startsWith("Relacionado con «Una tarde")).toBe(true)
    expect(text.endsWith("…»")).toBe(true)
    expect(text.length).toBeLessThanOrEqual(70)
  })
})

describe("RELATED_COPY", () => {
  it("is plain, neutral Spanish", () => {
    expect(RELATED_COPY.title).toBe("Contribuir con un recuerdo")
    expect(RELATED_COPY.sameLabel).toBe("Mismo lugar")
  })
})
