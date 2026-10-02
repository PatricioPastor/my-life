import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PLACE_COPY } from "./place-model"
import { PlaceSection } from "./place-section"
import { HINT } from "./sheet-styles"
import type { MapsLinkState } from "./use-maps-link"
import type { PhotoPlace } from "./use-photo-place"

afterEach(cleanup)

const AWAITING: PhotoPlace = {
  status: "found",
  lat: -34.593701,
  lng: -58.425123,
  label: null,
  address: null,
  naming: false,
  awaitingConsent: true,
}
const NAMED: PhotoPlace = { ...AWAITING, label: "Palermo, Buenos Aires", address: "Honduras 4000", awaitingConsent: false }
const LINKED: MapsLinkState = { status: "ok", lat: -34.58, lng: -58.42, label: "Plaza Italia", address: null }
const LINK = "https://maps.app.goo.gl/AbCd"

function renderSection({ place = { status: "idle" }, text = "", state = { status: "idle" } }: { place?: PhotoPlace; text?: string; state?: MapsLinkState } = {}) {
  render(
    <PlaceSection
      place={place}
      link={{ text, state }}
      onLinkChange={vi.fn()}
      consent={false}
      onConsentChange={vi.fn()}
      disabled={false}
    />,
  )
}

const help = () => document.getElementById("memory-place-help")
const status = () => document.getElementById("memory-place-status") as HTMLElement
const classesOf = (el: Element) => new Set(el.className.split(/\s+/).filter(Boolean))
const describedBy = (el: Element) => (el.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean)

describe("PlaceSection help line", () => {
  it.each([
    ["before a photo", { status: "idle" }],
    ["while the photo is read", { status: "reading" }],
    ["for a photo with no location", { status: "none" }],
  ] as const)("says nothing about the place's use %s, when there is no place to keep", (_, place) => {
    renderSection({ place })
    expect(help()).toBeNull()
    expect(screen.queryByText(PLACE_COPY.help)).toBeNull()
  })

  it.each([
    ["before the consent", AWAITING],
    ["once the place is named", NAMED],
  ] as const)("says what the place is for when the photo has one, %s", (_, place) => {
    renderSection({ place })
    expect(help()?.textContent).toBe(PLACE_COPY.help)
    expect(describedBy(screen.getByRole("checkbox"))).toContain("memory-place-help")
    expect(describedBy(screen.getByRole("textbox"))).toContain("memory-place-help")
  })

  it("says the same for a place from a pasted link, in words that are true for a link too", () => {
    renderSection({ place: { status: "none" }, text: LINK, state: LINKED })
    expect(help()?.textContent).toBe(PLACE_COPY.help)
    expect(PLACE_COPY.help).not.toMatch(/foto|guardamos/i)
  })

  it.each([
    ["is being read", { status: "resolving" }],
    ["was not understood", { status: "error", message: PLACE_COPY.linkUnreadable }],
  ] as const)("keeps no help line while a pasted link %s and the photo has no place", (_, state) => {
    renderSection({ place: { status: "none" }, text: LINK, state })
    expect(help()).toBeNull()
  })

  it("never points the link field at a line that is not on screen", () => {
    renderSection({ place: { status: "none" }, text: LINK, state: { status: "error", message: PLACE_COPY.linkUnreadable } })
    const ids = describedBy(screen.getByRole("textbox"))
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(document.getElementById(id)).not.toBeNull()
  })

  it("says the place's use once: not in the status, nor in the consent", () => {
    renderSection({ place: NAMED })
    expect(screen.getAllByText(PLACE_COPY.help)).toHaveLength(1)
    expect(PLACE_COPY.consent).not.toContain(PLACE_COPY.help)
  })
})

describe("PlaceSection status line", () => {
  it.each([
    ["for a photo with no location", { status: "none" }, PLACE_COPY.noGps],
    ["before a photo", { status: "idle" }, PLACE_COPY.idle],
    ["while the photo is read", { status: "reading" }, PLACE_COPY.reading],
  ] as const)("is a quiet hint %s, like every other hint, not a second heading", (_, place, text) => {
    renderSection({ place })
    expect(status().textContent).toBe(text)
    expect(classesOf(status())).toEqual(new Set(HINT.split(" ")))
  })

  it("shows a suggested place in the fields' ink, above the hints", () => {
    renderSection({ place: NAMED })
    expect(status().textContent).toBe("Parece que fue en Palermo, Buenos Aires")
    expect(classesOf(status()).has("text-ink")).toBe(true)
    expect(classesOf(status()).has("text-ink-muted")).toBe(false)
  })
})
