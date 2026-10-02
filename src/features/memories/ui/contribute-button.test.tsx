import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Dialog } from "radix-ui"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BackButton } from "@/features/journey/back-button"
import { BAR_CONTROL } from "@/shared/lib/top-bar"
import { ORB_HUES } from "../orb-hues"
import { ContributeButton } from "./contribute-button"

afterEach(cleanup)

const contribute = () => screen.getByRole("button", { name: "Contribuir" })
const classesOf = (el: Element) => new Set(el.className.split(/\s+/).filter(Boolean))

describe("ContributeButton", () => {
  it("is a plus mark and the word Contribuir, with the same label for the magnetic cursor", () => {
    render(<ContributeButton />)
    expect(contribute().textContent).toBe("Contribuir")
    expect(contribute().getAttribute("type")).toBe("button")
    expect(contribute().getAttribute("data-cursor-label")).toBe("Contribuir")
    expect(contribute().getAttribute("data-magnetic")).toBe("light")
    expect(contribute().querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("is drawn exactly like the way back: the same row, padding, type, tracking, ink and press", () => {
    render(
      <>
        <BackButton label="Universo" hint="Volver al universo" onClick={() => {}} />
        <ContributeButton />
      </>,
    )
    const back = screen.getByRole("button", { name: "Universo" })
    expect(classesOf(contribute())).toEqual(classesOf(back))
    for (const c of BAR_CONTROL.split(" ")) expect(classesOf(contribute()).has(c)).toBe(true)
  })

  it("is no longer a pill: no border, no rounded box, no backdrop, no label face of its own", () => {
    render(<ContributeButton />)
    expect(contribute().className).not.toMatch(/(^|\s)(border|rounded|backdrop|bg-|shadow|t-label)/)
  })

  it("leads with a mark the size of the back chevron, in the same place before the word", () => {
    render(
      <>
        <BackButton label="Universo" hint="Volver al universo" onClick={() => {}} />
        <ContributeButton />
      </>,
    )
    const chevron = screen.getByRole("button", { name: "Universo" }).querySelector("svg")!
    const mark = contribute().querySelector("[data-contribute-mark]")!
    expect(mark).toBe(contribute().firstElementChild)
    expect(mark.getAttribute("width")).toBe(chevron.getAttribute("width"))
    expect(mark.getAttribute("height")).toBe(chevron.getAttribute("height"))
    // A plus inside a thin ring.
    expect(mark.querySelector("circle")).not.toBeNull()
    expect(mark.querySelector("path")?.getAttribute("d")).toMatch(/v\d.*h\d|h\d.*v\d/)
  })

  it("glows softly, with no offset, in one of the curated orb hues", () => {
    render(<ContributeButton />)
    const mark = contribute().querySelector<SVGElement>("[data-contribute-mark]")!
    const glow = mark.style.filter
    expect(glow).toMatch(/^drop-shadow\(0(px)? 0(px)? /)
    expect(ORB_HUES.some((hex) => glow.includes(hex))).toBe(true)
  })

  it("adds the caller's classes and runs its click", () => {
    const onClick = vi.fn()
    render(<ContributeButton className="pointer-events-auto" onClick={onClick} />)
    expect(contribute().className).toContain("pointer-events-auto")
    fireEvent.click(contribute())
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("can be a dialog's trigger: it opens the dialog and says that it does", () => {
    render(
      <Dialog.Root>
        <Dialog.Trigger asChild>
          <ContributeButton />
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Content aria-describedby={undefined}>
            <Dialog.Title>Contribuir con un recuerdo</Dialog.Title>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>,
    )
    expect(contribute().getAttribute("aria-haspopup")).toBe("dialog")
    expect(contribute().getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(contribute())
    expect(screen.getByRole("dialog", { name: "Contribuir con un recuerdo" })).toBeTruthy()
  })
})
