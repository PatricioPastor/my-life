import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import { ORB_HUES } from "../orb-hues"
import type { CreateMemoryResult, PrepareUploadResult } from "../upload-view"
import { AddMemory, type AddMemoryProps } from "./add-memory"
import type { UploadResult } from "./cloudinary-upload"
import { COPY } from "./memory-form-model"
import { STEPPER_COPY } from "./memory-steps"
import { ORB_COLOR_COPY } from "./orb-color-picker"
import type { PhotoPalette } from "./photo-palette"
import { PLACE_COPY } from "./place-model"

vi.mock("@/shared/analytics", () => ({ track: () => undefined }))

beforeEach(() => {
  vi.stubGlobal("matchMedia", undefined)
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const MEMORY: MemoryView = {
  id: "new",
  caption: "Una tarde de lluvia",
  happenedOn: "2024-03-12",
  status: "pending",
  width: 800,
  height: 600,
  kind: "image",
  takenAt: null,
  dominantColor: null,
  place: null,
  orbColor: "#8ab4ff",
  viewCount: 0,
  relatedId: null,
  thumbUrl: "https://res.cloudinary.com/demo/t",
  fullUrl: "https://res.cloudinary.com/demo/f",
  audio: null,
}
const TONES = ["#ce8b9f", "#b69f62"]
const NOW = new Date(2026, 9, 1, 18, 30, 0)

function setup(over: Partial<AddMemoryProps> = {}) {
  const prepare = vi.fn(
    async (): Promise<PrepareUploadResult> => ({
      ok: true,
      upload: { cloudName: "demo", ticket: "ticket-1", photo: { api_key: "k", signature: "s" }, audio: null },
    }),
  )
  const upload = vi.fn(async (): Promise<UploadResult> => ({ ok: true }))
  const create = vi.fn<AddMemoryProps["create"]>(async () => ({ ok: true, memory: MEMORY, locationSaved: false }))
  const readPalette = vi.fn(async (): Promise<PhotoPalette> => ({ colors: TONES, fromPhoto: true }))
  const resolveLink = vi.fn<AddMemoryProps["resolveLink"]>(async () => ({ ok: false, reason: "not_maps_link" }))
  function Stage() {
    const [el, setEl] = useState<HTMLDivElement | null>(null)
    return (
      <div ref={setEl}>
        <AddMemory
          container={el}
          prepare={prepare}
          create={create}
          upload={upload}
          parseGps={async () => undefined}
          parsePhotoTime={async () => undefined}
          suggest={async () => ({ ok: true, label: null, address: null })}
          resolveLink={resolveLink}
          readPalette={readPalette}
          linkDebounceMs={0}
          onCreated={() => undefined}
          today="2026-10-01"
          clock={() => NOW}
          doneDelayMs={20}
          {...over}
        />
      </div>
    )
  }
  render(<Stage />)
  return { prepare, upload, create, readPalette, resolveLink }
}

const open = () => fireEvent.click(screen.getByRole("button", { name: "Contribuir" }))
const form = () => screen.getByTestId("memory-form")
const step = () => Number(form().getAttribute("data-step"))
const primary = () => screen.getByRole("button", { name: /^(Siguiente|Guardar recuerdo|Subiendo|Guardando)/ }) as HTMLButtonElement
const next = () => fireEvent.click(screen.getByRole("button", { name: STEPPER_COPY.next }))
const back = () => fireEvent.click(screen.getByRole("button", { name: STEPPER_COPY.back }))
const photoInput = () => screen.getByLabelText(/^(Elegir|Cambiar) foto$/) as HTMLInputElement
const photo = (name = "foto.jpg") => {
  const file = new File(["x"], name, { type: "image/jpeg" })
  Object.defineProperty(file, "size", { value: 2000 })
  return file
}
const pick = (file = photo()) => fireEvent.change(photoInput(), { target: { files: [file] } })
const caption = () => screen.getByLabelText(STEPPER_COPY.caption) as HTMLTextAreaElement
const date = () => screen.getByLabelText(STEPPER_COPY.when) as HTMLInputElement
const write = (text = "Una tarde de lluvia", day = "2024-03-12") => {
  fireEvent.change(caption(), { target: { value: text } })
  fireEvent.change(date(), { target: { value: day } })
}
const heading = () => screen.getByRole("heading", { level: 3 })
const announcer = () => screen.getByTestId("step-announcer")
/** Steps 1 and 2 done: a photo, the words and the date. Leaves the visitor on the color. */
const toColor = async () => {
  open()
  pick()
  next()
  write()
  next()
  await screen.findByRole("radiogroup", { name: ORB_COLOR_COPY.label })
}

describe("AddMemory steps: where the visitor is", () => {
  it("opens on the first step, says so in the kicker, and offers only Siguiente", () => {
    setup()
    open()
    expect(step()).toBe(1)
    expect(screen.getByText("Paso 1 de 3").className).toContain("t-label")
    expect(heading().textContent).toBe("¿Qué quieres dejar?")
    expect(screen.getByText("Una foto, tu voz o las dos.")).toBeTruthy()
    expect(primary().textContent).toBe("Siguiente")
    expect(screen.queryByRole("button", { name: STEPPER_COPY.back })).toBeNull()
  })

  it("keeps the later steps out of reach until the visitor gets there", () => {
    setup()
    open()
    expect(screen.queryByRole("textbox", { name: STEPPER_COPY.caption })).toBeNull()
    expect(screen.queryByRole("radiogroup")).toBeNull()
    expect(screen.queryByRole("group", { name: PLACE_COPY.heading })).toBeNull()
  })

  it("is the only uppercase pixel text in the sheet: every label is sentence case in the body face", () => {
    setup()
    open()
    pick()
    next()
    expect(screen.getByRole("dialog").querySelectorAll(".t-label")).toHaveLength(1)
    expect(screen.getByText(STEPPER_COPY.caption).className).toContain("t-body")
    expect(screen.getByText(STEPPER_COPY.when).className).toContain("t-body")
  })

  it("fills one progress segment per step reached, in the orb's color once there is one", async () => {
    setup()
    open()
    const filled = () => screen.getAllByTestId("step-segment").filter((s) => s.getAttribute("data-filled") === "true")
    expect(screen.getAllByTestId("step-segment")).toHaveLength(3)
    expect(filled()).toHaveLength(1)
    // Before there is a color, the foreground.
    expect(filled()[0].className).toContain("bg-ink")
    pick()
    // The photo's dominant tone (#ce8b9f) is the proposed color.
    await waitFor(() => expect(filled()[0].style.backgroundColor).toBe("rgb(206, 139, 159)"))
    next()
    expect(filled()).toHaveLength(2)
    expect(filled()[1].style.backgroundColor).toBe("rgb(206, 139, 159)")
  })

  it("has a 40 px close button in the corner, named Cerrar", () => {
    setup()
    open()
    const close = screen.getByRole("button", { name: STEPPER_COPY.close })
    expect(close.className).toMatch(/(^|\s)size-10(\s|$)/)
    expect(close.className).toContain("rounded-panel")
  })
})

describe("AddMemory steps: Siguiente checks only the step it is on", () => {
  it("asks for a photo or the voice on the first step, beside the field, and focuses the photo", () => {
    const { prepare } = setup()
    open()
    next()
    expect(step()).toBe(1)
    const error = screen.getByText(COPY.media)
    expect(photoInput().getAttribute("aria-describedby")).toContain(error.id)
    expect(photoInput().getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(photoInput())
    expect(prepare).not.toHaveBeenCalled()
  })

  it("does not ask for the words or the date before the visitor reaches them", () => {
    setup()
    open()
    pick()
    next()
    expect(step()).toBe(2)
    expect(screen.queryByText(COPY.caption)).toBeNull()
    expect(screen.queryByText(COPY.dateInvalid)).toBeNull()
  })

  it("asks for the words and the date on the second step, and focuses the first one missing", () => {
    setup()
    open()
    pick()
    next()
    next()
    expect(step()).toBe(2)
    const error = screen.getByText(COPY.caption)
    expect(caption().getAttribute("aria-describedby")).toContain(error.id)
    expect(screen.getByText(COPY.dateInvalid)).toBeTruthy()
    expect(document.activeElement).toBe(caption())
  })

  it("keeps a Maps link that is not understood from standing for the place, beside the link, focused", async () => {
    const { resolveLink } = setup({ parseGps: async () => undefined })
    open()
    pick()
    next()
    write()
    const link = await screen.findByRole("textbox", { name: /link de Google Maps/ })
    fireEvent.change(link, { target: { value: "https://example.com" } })
    await waitFor(() => expect(resolveLink).toHaveBeenCalled())
    await screen.findByText(PLACE_COPY.linkNotMaps)
    next()
    expect(step()).toBe(2)
    const error = screen.getByText(PLACE_COPY.linkBlocked)
    expect(link.getAttribute("aria-describedby")).toContain(error.id)
    expect(document.activeElement).toBe(link)
  })
})

describe("AddMemory steps: moving between them", () => {
  it("opens on the first step's heading, the way every step arrives, not on Cerrar", () => {
    setup()
    open()
    expect(heading().textContent).toBe("¿Qué quieres dejar?")
    expect(document.activeElement).toBe(heading())
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: STEPPER_COPY.close }))
  })

  it("moves focus to the new step's heading and announces it", () => {
    setup()
    open()
    pick()
    next()
    expect(heading().textContent).toBe("Cuéntalo")
    expect(document.activeElement).toBe(heading())
    expect(heading().getAttribute("tabindex")).toBe("-1")
    expect(heading().className).toContain("text-balance")
    expect(announcer().getAttribute("aria-live")).toBe("polite")
    expect(announcer().textContent).toBe("Paso 2 de 3: Cuéntalo")
  })

  it("offers Atrás from the second step, and keeps the primary as the last, right-hand control", () => {
    setup()
    open()
    pick()
    next()
    const actions = screen.getByTestId("memory-actions-row")
    const buttons = within(actions).getAllByRole("button")
    expect(buttons.map((b) => b.textContent)).toEqual(["Atrás", "Siguiente"])
    write()
    next()
    expect(within(actions).getAllByRole("button").map((b) => b.textContent)).toEqual(["Atrás", "Guardar recuerdo"])
  })

  it("keeps everything when the visitor goes back", async () => {
    setup()
    await toColor()
    fireEvent.click(screen.getAllByRole("radio")[1])
    back()
    expect(step()).toBe(2)
    expect(caption().value).toBe("Una tarde de lluvia")
    expect(date().value).toBe("2024-03-12")
    back()
    expect(step()).toBe(1)
    expect(screen.getByRole("img", { name: STEPPER_COPY.photo.preview })).toBeTruthy()
    next()
    next()
    expect(screen.getAllByRole("radio")[1].getAttribute("aria-checked")).toBe("true")
  })

  it("lets the step it leaves fade out, out of reach, and tells the motion which way it goes", () => {
    setup()
    open()
    pick()
    next()
    const steps = () => Array.from(form().querySelectorAll<HTMLElement>("[data-step-panel]"))
    const [first, second] = steps()
    expect(first.getAttribute("data-state")).toBe("leaving")
    expect(first.getAttribute("aria-hidden")).toBe("true")
    expect(first.hasAttribute("inert")).toBe(true)
    expect(second.getAttribute("data-state")).toBe("active")
    expect(screen.getByTestId("memory-steps").style.getPropertyValue("--step-dir")).toBe("1")
    fireEvent.transitionEnd(first)
    expect(first.hidden).toBe(true)
    back()
    expect(screen.getByTestId("memory-steps").style.getPropertyValue("--step-dir")).toBe("-1")
  })

  it("starts over on the first step when it is closed and opened again", async () => {
    setup()
    open()
    pick()
    next()
    fireEvent.click(screen.getByRole("button", { name: STEPPER_COPY.close }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    open()
    expect(step()).toBe(1)
  })
})

describe("AddMemory steps: Enter and saving", () => {
  it("treats Enter (the form's submit) on the first two steps as Siguiente, and saves nothing", () => {
    const { prepare } = setup()
    open()
    pick()
    fireEvent.submit(form())
    expect(step()).toBe(2)
    write()
    fireEvent.submit(form())
    expect(step()).toBe(3)
    expect(prepare).not.toHaveBeenCalled()
  })

  it("keeps Enter in the words a new line", () => {
    setup()
    open()
    pick()
    next()
    expect(caption().tagName).toBe("TEXTAREA")
    fireEvent.keyDown(caption(), { key: "Enter" })
    expect(step()).toBe(2)
  })

  it("saves only on the last step", async () => {
    const { prepare, create } = setup()
    await toColor()
    fireEvent.click(primary())
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(prepare).toHaveBeenCalledTimes(1)
  })

  it("does not save on the second click of a double click that went past Siguiente", () => {
    const { prepare } = setup()
    open()
    pick()
    next()
    write()
    fireEvent.click(primary(), { detail: 1 })
    expect(step()).toBe(3)
    fireEvent.click(primary(), { detail: 2 })
    expect(prepare).not.toHaveBeenCalled()
  })

  it("shows a failed save on the last step, next to Guardar recuerdo", async () => {
    setup({ create: async () => ({ ok: false, reason: "unavailable" }) })
    await toColor()
    fireEvent.click(primary())
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe(COPY.unavailable)
    expect(step()).toBe(3)
    expect(screen.getByTestId("memory-actions").contains(alert)).toBe(true)
  })

  it("goes back to the step of a field the server refused, and focuses it", async () => {
    setup({ create: async (): Promise<CreateMemoryResult> => ({ ok: false, reason: "invalid", errors: ["caption_empty"] }) })
    await toColor()
    fireEvent.click(primary())
    await waitFor(() => expect(step()).toBe(2))
    expect(screen.getByText(COPY.caption)).toBeTruthy()
    expect(document.activeElement).toBe(caption())
  })

  it("goes back to the photo when the server refused it", async () => {
    setup({ create: async (): Promise<CreateMemoryResult> => ({ ok: false, reason: "asset_too_large" }) })
    await toColor()
    fireEvent.click(primary())
    await waitFor(() => expect(step()).toBe(1))
    expect(document.activeElement).toBe(photoInput())
    expect(photoInput().getAttribute("aria-describedby")).toContain(screen.getByText(COPY.photoSize).id)
  })

  it("says once, under the color, when the memory will show", async () => {
    setup()
    await toColor()
    expect(screen.getByText(STEPPER_COPY.approval)).toBeTruthy()
  })
})

describe("AddMemory steps: the color", () => {
  it("says the first colors come from the photo when one of them does", async () => {
    setup()
    await toColor()
    expect(screen.getByText(ORB_COLOR_COPY.fromPhoto)).toBeTruthy()
  })

  it("says nothing about the photo when every tone of it was folded into a curated hue", async () => {
    const { readPalette } = setup()
    readPalette.mockResolvedValue({ colors: [ORB_HUES[4]], fromPhoto: true })
    await toColor()
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("data-color"))).toEqual(ORB_HUES)
    expect(screen.queryByText(ORB_COLOR_COPY.fromPhoto)).toBeNull()
  })

  it("shows the orb large, in the chosen color", async () => {
    setup()
    await toColor()
    const preview = screen.getByTestId("orb-preview")
    expect(preview.className).toMatch(/(^|\s)size-(28|30|32)(\s|$)/)
    fireEvent.click(screen.getAllByRole("radio")[1])
    expect((preview.querySelector(".mem-dot") as HTMLElement).style.getPropertyValue("--pc")).toBe(TONES[1])
  })
})

describe("AddMemory steps: concentric surfaces", () => {
  it("rounds the sheet with the sheet radius: the top corners on a phone, all four from md", () => {
    setup()
    open()
    const card = screen.getByTestId("memory-card")
    expect(card.className).toContain("rounded-t-sheet")
    expect(card.className).toContain("md:rounded-sheet")
    expect(card.className).not.toMatch(/rounded-(sm|md|lg|xl|2xl)/)
  })

  it("rounds what sits in the sheet padding with the panel radius, and what sits in a panel with the inner one", () => {
    setup()
    open()
    expect(screen.getByTestId("photo-drop").className).toContain("rounded-panel")
    expect(screen.getByTestId("audio-box").className).toContain("rounded-panel")
    expect(screen.getByTestId("audio-box").className).toContain("p-panel")
    expect(screen.getByText("Subir audio").closest("label")!.className).toContain("rounded-inner")
    expect(primary().className).toContain("rounded-panel")
    expect(primary().className).toMatch(/(^|\s)h-12(\s|$)/)
    pick()
    next()
    expect(caption().className).toContain("rounded-panel")
    expect(date().className).toContain("rounded-panel")
    expect(screen.getByRole("button", { name: STEPPER_COPY.back }).className).toContain("rounded-panel")
  })

  it("pads the sheet with the sheet padding on every side, the bottom safe area included", () => {
    setup()
    open()
    expect(screen.getByTestId("memory-scroll").className).toContain("px-sheet")
    const actions = screen.getByTestId("memory-actions")
    expect(actions.className).toContain("px-sheet")
    expect(actions.className).toContain("pb-[calc(var(--sheet-pad)+env(safe-area-inset-bottom))]")
  })

  it("is one column at every width", () => {
    setup()
    open()
    expect(screen.getByRole("dialog").innerHTML).not.toMatch(/md:grid-cols-/)
  })

  it("sets its buttons in the body face as a utility, past the stage's `.ui button { font: inherit }`", () => {
    setup()
    open()
    pick()
    next()
    for (const button of [primary(), screen.getByRole("button", { name: STEPPER_COPY.back })]) {
      expect(button.className).toContain("font-gambarino")
    }
    back()
    expect(screen.getByText("Subir audio").closest("label")!.className).toContain("font-gambarino")
  })

  it("presses its footer buttons to 0.96, moving only the scale and the colors", () => {
    setup()
    open()
    expect(primary().className).toContain("active:not-disabled:scale-[0.96]")
    expect(primary().className).not.toMatch(/transition-all|(^|\s)transition(\s|$)/)
  })
})

describe("AddMemory steps: while saving", () => {
  it("cannot go back while the memory is being saved", async () => {
    setup({ upload: (() => new Promise<UploadResult>(() => undefined)) as never })
    await toColor()
    fireEvent.click(primary())
    await screen.findByRole("button", { name: /Subiendo/ })
    expect((screen.getByRole("button", { name: STEPPER_COPY.back }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => {})
  })
})
