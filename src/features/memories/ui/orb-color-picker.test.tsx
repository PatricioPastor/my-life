import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_ORB_COLOR, rimColor, swatchNames } from "../orb-color"
import { ORB_HUES, ORB_HUE_NAMES } from "../orb-hues"
import { OrbColorPicker, ORB_COLOR_COPY, type OrbColorPickerProps } from "./orb-color-picker"

afterEach(cleanup)

const COLORS = ["#ff9a3c", "#a58cff", "#4fd1b9", "#e88ad6"]

function setup(over: Partial<OrbColorPickerProps> = {}) {
  const onChange = vi.fn()
  const props: OrbColorPickerProps = {
    status: "ready",
    colors: COLORS,
    value: COLORS[0],
    fromPhoto: true,
    disabled: false,
    onChange,
    ...over,
  }
  const view = render(<OrbColorPicker {...props} />)
  const rerender = (next: Partial<OrbColorPickerProps>) => view.rerender(<OrbColorPicker {...props} {...next} />)
  return { onChange, rerender }
}

const group = () => screen.getByRole("radiogroup", { name: ORB_COLOR_COPY.label })
const radios = () => screen.getAllByRole("radio") as HTMLButtonElement[]

describe("OrbColorPicker radiogroup", () => {
  it("is a radiogroup named by its label, with one round radio per color", () => {
    setup()
    expect(group()).toBeTruthy()
    expect(radios()).toHaveLength(COLORS.length)
  })

  it("names each swatch with a simple Spanish color name from its hue and lightness", () => {
    setup()
    expect(radios().map((r) => r.getAttribute("aria-label"))).toEqual(["naranja", "violeta", "verde azulado", "fucsia"])
  })

  it("keeps the names distinct when two swatches share a hue family", () => {
    const similar = ["#ff9a3c", "#ffa24a", "#a58cff"]
    setup({ colors: similar, value: similar[0] })
    const names = radios().map((r) => r.getAttribute("aria-label"))
    expect(names).toEqual(swatchNames(similar))
    expect(new Set(names).size).toBe(names.length)
  })

  it("checks the selected swatch and no other, and makes only it tabbable", () => {
    setup({ value: COLORS[1] })
    expect(radios().map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false", "false"])
    expect(radios().map((r) => r.tabIndex)).toEqual([-1, 0, -1, -1])
  })

  it("paints each swatch in its own color", () => {
    setup()
    for (const [index, radio] of radios().entries()) {
      const dot = radio.querySelector("[data-swatch]") as HTMLElement
      expect(dot.style.backgroundColor).not.toBe("")
      expect(radio.getAttribute("data-color")).toBe(COLORS[index])
    }
  })

  it("selects a swatch when it is pressed", () => {
    const { onChange } = setup()
    fireEvent.click(radios()[2])
    expect(onChange).toHaveBeenCalledWith("#4fd1b9")
  })
})

describe("OrbColorPicker keyboard", () => {
  const press = (key: string, from = 0) => {
    radios()[from].focus()
    fireEvent.keyDown(radios()[from], { key })
  }

  it.each(["ArrowRight", "ArrowDown"])("moves to the next swatch with %s, and focuses it", (key) => {
    const { onChange } = setup()
    press(key)
    expect(onChange).toHaveBeenCalledWith(COLORS[1])
  })

  it.each(["ArrowLeft", "ArrowUp"])("moves to the previous swatch with %s", (key) => {
    const { onChange } = setup({ value: COLORS[2] })
    press(key, 2)
    expect(onChange).toHaveBeenCalledWith(COLORS[1])
  })

  it("wraps around at both ends", () => {
    const { onChange } = setup()
    press("ArrowLeft", 0)
    expect(onChange).toHaveBeenLastCalledWith(COLORS[3])
    press("ArrowRight", 3)
    expect(onChange).toHaveBeenLastCalledWith(COLORS[0])
  })

  it("jumps to the first and last swatch with Home and End", () => {
    const { onChange } = setup({ value: COLORS[1] })
    press("End", 1)
    expect(onChange).toHaveBeenLastCalledWith(COLORS[3])
    press("Home", 1)
    expect(onChange).toHaveBeenLastCalledWith(COLORS[0])
  })

  it("moves focus together with the selection", () => {
    const { rerender } = setup()
    press("ArrowRight")
    rerender({ value: COLORS[1] })
    expect(document.activeElement).toBe(radios()[1])
  })

  it("ignores other keys", () => {
    const { onChange } = setup()
    press("a")
    press("Tab")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("does nothing while disabled", () => {
    const { onChange } = setup({ disabled: true })
    press("ArrowRight")
    fireEvent.click(radios()[1])
    expect(onChange).not.toHaveBeenCalled()
    for (const radio of radios()) expect(radio.disabled).toBe(true)
  })
})

describe("OrbColorPicker preview and states", () => {
  const preview = () => screen.getByTestId("orb-preview")

  it("shows a live orb preview that glows in the chosen color, with its rim", () => {
    setup({ value: COLORS[1] })
    const orb = preview().querySelector(".mem-dot") as HTMLElement
    expect(orb.style.getPropertyValue("--pc")).toBe(COLORS[1])
    expect(orb.style.getPropertyValue("--rim")).toBe(rimColor(COLORS[1]))
  })

  it("keeps the preview out of the accessibility tree: the swatches already say the color", () => {
    setup()
    expect(preview().getAttribute("aria-hidden")).toBe("true")
  })

  it("reserves the preview and the swatch row before any photo, so nothing jumps when they appear", () => {
    setup({ status: "idle", colors: [], value: null })
    expect(preview()).toBeTruthy()
    expect(screen.queryByRole("radiogroup")).toBeNull()
    expect(screen.getByTestId("orb-swatches").className).toMatch(/min-h-/)
    expect(preview().querySelector(".mem-dot")?.getAttribute("style")).toContain(DEFAULT_ORB_COLOR)
  })

  it.each([
    ["idle", ORB_COLOR_COPY.idle],
    ["reading", ORB_COLOR_COPY.reading],
  ] as const)("says what is going on while %s", (status, text) => {
    setup({ status, colors: [], value: null })
    expect(screen.getByText(text)).toBeTruthy()
  })

  it("says the colors come from the photo when they do", () => {
    setup()
    expect(screen.getByText(ORB_COLOR_COPY.fromPhoto)).toBeTruthy()
  })

  it("says honestly, and still offers swatches, when the photo's colors could not be read", () => {
    setup({ fromPhoto: false })
    expect(screen.getByText(ORB_COLOR_COPY.fallback)).toBeTruthy()
    expect(radios().length).toBeGreaterThan(0)
  })

  it("links the group to its note", () => {
    setup()
    const ids = group().getAttribute("aria-describedby")!.split(" ")
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain(ORB_COLOR_COPY.fromPhoto)
  })

  it("uses the neutral tú, never voseo", () => {
    expect(JSON.stringify(ORB_COLOR_COPY)).not.toMatch(/\b(elegí|pegá|querés|podés|sacá)\b/i)
    expect(ORB_COLOR_COPY.label).toBe("Color de tu orbe")
  })
})

describe("OrbColorPicker with no photo (a voice-only memory)", () => {
  it("says the colors are the site's own, not the photo's", () => {
    setup({ fromPhoto: false, voice: true })
    expect(screen.getByText(ORB_COLOR_COPY.voice)).toBeTruthy()
    expect(screen.queryByText(ORB_COLOR_COPY.fallback)).toBeNull()
    expect(screen.queryByText(ORB_COLOR_COPY.fromPhoto)).toBeNull()
  })

  it("still offers a radiogroup of swatches that can be chosen", () => {
    const { onChange } = setup({ fromPhoto: false, voice: true })
    fireEvent.click(radios()[2])
    expect(onChange).toHaveBeenCalledWith(COLORS[2])
  })

  it("asks for a photo or an audio while there is neither", () => {
    setup({ status: "idle", colors: [], value: null, fromPhoto: false })
    expect(screen.getByText(ORB_COLOR_COPY.idle)).toBeTruthy()
    expect(ORB_COLOR_COPY.idle).toMatch(/foto o un audio/)
  })
})

describe("OrbColorPicker on a phone", () => {
  it("gives every swatch a 44 px touch target", () => {
    setup({ fromPhoto: true })
    for (const radio of radios()) expect(radio.className).toMatch(/(^|\s)size-11(\s|$)/)
  })

  it("lays the swatches out in rows of six 44 px cells: the photo's tones, then the curated hues two rows below", () => {
    setup({ colors: [...COLORS, ...ORB_HUES] })
    expect(screen.getByTestId("orb-swatches").className).toMatch(/(^|\s)grid(\s|$)/)
    expect(screen.getByTestId("orb-swatches").className).toContain("grid-cols-[repeat(6,2.75rem)]")
    expect(radios()).toHaveLength(COLORS.length + 12)
  })

  it("keeps the same six-cell row for the empty slots before there is a photo", () => {
    setup({ status: "idle", colors: [], value: null })
    const slots = screen.getByTestId("orb-swatches").firstElementChild as HTMLElement
    expect(slots.className).toContain("grid-cols-[repeat(6,2.75rem)]")
  })
})

describe("OrbColorPicker with the curated hues", () => {
  it("calls each curated hue by its own Spanish name, and a photo tone by its hue", () => {
    setup({ colors: [COLORS[0], ...ORB_HUES] })
    expect(radios().map((r) => r.getAttribute("aria-label"))).toEqual(["naranja", ...ORB_HUES.map((hex) => ORB_HUE_NAMES[hex])])
  })

  it("says the first colors are the photo's, since the curated ones follow", () => {
    setup()
    expect(ORB_COLOR_COPY.fromPhoto).toMatch(/primeros colores/i)
  })

  it("says the photo note when at least one swatch is a tone of the photo itself", () => {
    setup({ colors: [COLORS[0], ...ORB_HUES], value: COLORS[0] })
    expect(screen.getByText(ORB_COLOR_COPY.fromPhoto)).toBeTruthy()
  })

  it("does not say it when every tone of the photo was folded into a curated hue (the swatches are all curated)", () => {
    setup({ colors: ORB_HUES, value: ORB_HUES[1], fromPhoto: true })
    expect(screen.queryByText(ORB_COLOR_COPY.fromPhoto)).toBeNull()
    expect(screen.queryByText(ORB_COLOR_COPY.fallback)).toBeNull()
    expect(screen.getByTestId("orb-note").textContent).toBe("")
  })
})
