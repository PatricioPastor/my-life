import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import { MAX_UPLOAD_BYTES } from "../upload-limits"
import type { CreateMemoryResult, PrepareUploadResult } from "../upload-view"
import type { ResolveMapsLinkResult } from "../place/resolve-maps-link"
import type { SuggestPlaceResult } from "../place/suggest-place"
import { AddMemory, type AddMemoryProps } from "./add-memory"
import type { UploadResult } from "./cloudinary-upload"
import { ORB_COLOR_COPY } from "./orb-color-picker"
import type { PhotoPalette } from "./photo-palette"
import { PLACE_COPY } from "./place-model"

const track = vi.fn()
vi.mock("@/shared/analytics", () => ({ track: (...args: unknown[]) => track(...args) }))

beforeEach(() => {
  vi.stubGlobal("matchMedia", undefined)
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }))
})
afterEach(() => {
  cleanup()
  track.mockReset()
  vi.unstubAllGlobals()
})

const GRANT: PrepareUploadResult = {
  ok: true,
  upload: { cloudName: "demo", ticket: "ticket-1", photo: { api_key: "k", signature: "s" }, audio: null },
}
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

/** What the browser would take from the photo: glowing tones, the dominant one first. */
const SWATCHES = ["#ff9a3c", "#a58cff", "#4fd1b9", "#e88ad6"]

function setup(over: Partial<AddMemoryProps> = {}) {
  const prepare = vi.fn(async (): Promise<PrepareUploadResult> => GRANT)
  const upload = vi.fn(async (): Promise<UploadResult> => ({ ok: true }))
  const create = vi.fn<AddMemoryProps["create"]>(async () => ({ ok: true, memory: MEMORY, locationSaved: false }))
  // The photo has no GPS unless a test says so; the answer is what exifr reports, with its exact decimals.
  const parseGps = vi.fn(async (): Promise<{ latitude: number; longitude: number } | undefined> => undefined)
  const suggest = vi.fn(async (): Promise<SuggestPlaceResult> => ({ ok: true, label: "Palermo, Buenos Aires", address: "Honduras 4000, Buenos Aires" }))
  const resolveLink = vi.fn(
    async (): Promise<ResolveMapsLinkResult> => ({ ok: true, lat: -34.58, lng: -58.42, label: "Plaza Italia", address: "Av. Rivadavia 1234, Buenos Aires" }),
  )
  const readPalette = vi.fn(async (): Promise<PhotoPalette> => ({ colors: SWATCHES, fromPhoto: true }))
  const onCreated = vi.fn()
  function Stage() {
    const [el, setEl] = useState<HTMLDivElement | null>(null)
    return (
      <div ref={setEl}>
        <button type="button">Fondo</button>
        <AddMemory
          container={el}
          prepare={prepare}
          create={create}
          upload={upload}
          parseGps={parseGps}
          suggest={suggest}
          resolveLink={resolveLink}
          readPalette={readPalette}
          linkDebounceMs={0}
          onCreated={onCreated}
          today="2026-10-01"
          doneDelayMs={20}
          {...over}
        />
      </div>
    )
  }
  render(<Stage />)
  return { prepare, upload, create, onCreated, parseGps, suggest, resolveLink, readPalette }
}

const open = () => fireEvent.click(screen.getByRole("button", { name: "Contribuir" }))
const photo = (over: Partial<{ name: string; type: string; size: number }> = {}) => {
  const { name = "foto.jpg", type = "image/jpeg", size = 2000 } = over
  const file = new File(["x"], name, { type })
  Object.defineProperty(file, "size", { value: size })
  return file
}
const pick = (file: File) =>
  fireEvent.change(screen.getByLabelText("Foto"), { target: { files: [file] } })
const fill = (caption = "Una tarde de lluvia", date = "2024-03-12") => {
  fireEvent.change(screen.getByLabelText("¿Qué recuerdas?"), { target: { value: caption } })
  fireEvent.change(screen.getByLabelText("¿Cuándo fue?"), { target: { value: date } })
}
const submit = () => fireEvent.click(screen.getByRole("button", { name: /Guardar recuerdo|Subiendo|Guardando/ }))
const filled = () => {
  open()
  pick(photo())
  fill()
}

describe("AddMemory dialog", () => {
  it("opens from the Contribuir control into a titled, described dialog", () => {
    setup()
    expect(screen.queryByRole("dialog")).toBeNull()
    open()
    const dialog = screen.getByRole("dialog", { name: "Contribuir con un recuerdo" })
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy()
    expect(within(dialog).getByText(/pendiente|aprobad/i)).toBeTruthy()
  })

  it("sets the title in Gambarino through the title role", () => {
    setup()
    open()
    expect(screen.getByRole("heading", { name: "Contribuir con un recuerdo" }).className).toContain("t-title")
  })

  it("has the three labelled fields", () => {
    setup()
    open()
    expect(screen.getByLabelText("Foto")).toBeTruthy()
    expect(screen.getByLabelText("¿Qué recuerdas?")).toBeTruthy()
    expect(screen.getByLabelText("¿Cuándo fue?")).toBeTruthy()
  })

  it("limits the date from 1900-01-01 to today", () => {
    setup()
    open()
    const date = screen.getByLabelText("¿Cuándo fue?") as HTMLInputElement
    expect(date.type).toBe("date")
    expect(date.max).toBe("2026-10-01")
    expect(date.min).toBe("1900-01-01")
  })

  it("counts the caption live out of 140", () => {
    setup()
    open()
    expect(screen.getByText("0/140")).toBeTruthy()
    fireEvent.change(screen.getByLabelText("¿Qué recuerdas?"), { target: { value: "Hola 😀" } })
    expect(screen.getByText("6/140")).toBeTruthy()
  })

  it("makes everything behind it unreachable while it is open, and reachable again on close", () => {
    setup()
    const trigger = screen.getByRole("button", { name: "Contribuir" })
    const covered = (el: HTMLElement) => el.closest("[aria-hidden='true'],[inert]") !== null
    expect(covered(trigger)).toBe(false)
    open()
    expect(covered(screen.getByText("Fondo"))).toBe(true)
    expect(covered(trigger)).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }))
    return waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
      expect(covered(screen.getByText("Fondo"))).toBe(false)
    })
  })

  it("returns focus to the Contribuir control when it closes", async () => {
    setup()
    const trigger = screen.getByRole("button", { name: "Contribuir" })
    trigger.focus()
    open()
    expect(document.activeElement).not.toBe(trigger)
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it("starts empty every time it opens", async () => {
    setup()
    open()
    fill("algo")
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    open()
    expect((screen.getByLabelText("¿Qué recuerdas?") as HTMLTextAreaElement).value).toBe("")
  })
})

describe("AddMemory photo", () => {
  it("shows a preview and the file name once a good photo is picked", () => {
    setup()
    open()
    pick(photo({ name: "lluvia.jpg" }))
    expect(screen.getByText("lluvia.jpg")).toBeTruthy()
    expect(screen.getByRole("img", { name: "Vista previa" }).getAttribute("src")).toBe("blob:preview")
  })

  it("falls back to the file name when the browser cannot draw the photo (HEIC)", () => {
    setup()
    open()
    pick(photo({ name: "IMG_0001.HEIC", type: "image/heic" }))
    fireEvent.error(screen.getByRole("img", { name: "Vista previa" }))
    expect(screen.queryByRole("img", { name: "Vista previa" })).toBeNull()
    expect(screen.getByText("IMG_0001.HEIC")).toBeTruthy()
  })

  it("refuses a photo of the wrong type right away, linked to the field", () => {
    setup()
    open()
    pick(photo({ name: "a.gif", type: "image/gif" }))
    const error = screen.getByText("Elige una foto JPG, PNG, WebP o HEIC.")
    expect(screen.getByLabelText("Foto").getAttribute("aria-describedby")).toContain(error.id)
    expect(screen.getByLabelText("Foto").getAttribute("aria-invalid")).toBe("true")
    expect(screen.queryByRole("img", { name: "Vista previa" })).toBeNull()
  })

  it("refuses a photo over 10 MB right away", () => {
    setup()
    open()
    pick(photo({ size: MAX_UPLOAD_BYTES + 1 }))
    expect(screen.getByText("La foto supera los 10 MB.")).toBeTruthy()
  })

  it("takes a photo dropped on the picker", () => {
    setup()
    open()
    const zone = screen.getByTestId("photo-drop")
    fireEvent.dragOver(zone, { dataTransfer: { files: [], types: ["Files"] } })
    fireEvent.drop(zone, { dataTransfer: { files: [photo({ name: "soltada.jpg" })] } })
    expect(screen.getByText("soltada.jpg")).toBeTruthy()
  })

  it("clears the error once a good photo replaces a bad one", () => {
    setup()
    open()
    pick(photo({ type: "image/gif", name: "a.gif" }))
    pick(photo())
    expect(screen.queryByText("Elige una foto JPG, PNG, WebP o HEIC.")).toBeNull()
  })
})

describe("AddMemory submit", () => {
  it("shows each field error, linked to its field, and uploads nothing", () => {
    const { prepare, upload } = setup()
    open()
    submit()
    expect(screen.getByText("Agrega una foto o un audio.")).toBeTruthy()
    const caption = screen.getByText("Escribe entre 1 y 140 caracteres.")
    expect(screen.getByLabelText("¿Qué recuerdas?").getAttribute("aria-describedby")).toContain(caption.id)
    const date = screen.getByText("Elige una fecha entre 1900 y hoy.")
    expect(screen.getByLabelText("¿Cuándo fue?").getAttribute("aria-describedby")).toContain(date.id)
    expect(prepare).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
  })

  it("refuses a future date", () => {
    setup()
    open()
    pick(photo())
    fill("Hola", "2026-10-02")
    submit()
    expect(screen.getByText("La fecha no puede ser futura.")).toBeTruthy()
  })

  it("reads Guardar recuerdo until it starts", () => {
    setup()
    open()
    expect(screen.getByRole("button", { name: "Guardar recuerdo" })).toBeTruthy()
  })

  it("goes through Subiendo con porcentaje and Guardando, disabled the whole time, then confirms", async () => {
    let finishUpload!: (r: UploadResult) => void
    let finishCreate!: (r: CreateMemoryResult) => void
    const upload = vi.fn(
      ({ onProgress }: { onProgress: (n: number) => void }) =>
        new Promise<UploadResult>((resolve) => {
          onProgress(42)
          finishUpload = resolve
        }),
    )
    const create = vi.fn(() => new Promise<CreateMemoryResult>((resolve) => (finishCreate = resolve)))
    const { onCreated, prepare } = setup({ upload: upload as never, create })
    filled()
    submit()

    const uploading = await screen.findByRole("button", { name: "Subiendo… 42%" })
    expect((uploading as HTMLButtonElement).disabled).toBe(true)
    expect(prepare).toHaveBeenCalledTimes(1)

    await act(async () => finishUpload({ ok: true }))
    const saving = await screen.findByRole("button", { name: "Guardando…" })
    expect((saving as HTMLButtonElement).disabled).toBe(true)
    expect(create).toHaveBeenCalledWith({ ticket: "ticket-1", caption: "Una tarde de lluvia", happenedOn: "2024-03-12", shareLocation: false })

    await act(async () => finishCreate({ ok: true, memory: MEMORY, locationSaved: false }))
    expect((await screen.findByRole("status")).textContent).toBe("Listo. Tu recuerdo quedó pendiente de aprobación.")
    expect(onCreated).toHaveBeenCalledWith(MEMORY)
  })

  it("tracks memory_submitted once, on success only, with no props", async () => {
    setup()
    filled()
    submit()
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1))
    expect(track).toHaveBeenCalledWith("memory_submitted")
  })

  it("closes by itself after the confirmation and gives the new memory to the place", async () => {
    const { onCreated } = setup()
    filled()
    submit()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(onCreated).toHaveBeenCalledTimes(1)
  })

  it("sends the caption trimmed", async () => {
    const { create } = setup()
    open()
    pick(photo())
    fill("  Hola  ")
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ caption: "Hola" }))
  })
})

describe("AddMemory failures", () => {
  const failAt = async (setupOver: Partial<AddMemoryProps>, text: string, linkedTo: "submit" | "photo" = "submit") => {
    const handles = setup(setupOver)
    filled()
    submit()
    const alert = await screen.findByText(text)
    expect(track).not.toHaveBeenCalled()
    expect(handles.onCreated).not.toHaveBeenCalled()
    // The form is usable again, and the error is linked to the submit button.
    const button = screen.getByRole("button", { name: "Guardar recuerdo" }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    const owner = linkedTo === "photo" ? screen.getByLabelText("Foto") : button
    expect(owner.getAttribute("aria-describedby")).toContain(alert.id)
    return handles
  }

  it("rate limited", async () => {
    const { upload } = await failAt(
      { prepare: async () => ({ ok: false, reason: "rate_limited" }) },
      "Ya agregaste 5 recuerdos hoy. Vuelve mañana.",
    )
    expect(upload).not.toHaveBeenCalled()
  })

  it("no session", async () => {
    await failAt(
      { prepare: async () => ({ ok: false, reason: "no_session" }) },
      "Vuelve a entrar con tu usuario para agregar recuerdos.",
    )
  })

  it("unavailable when preparing the upload fails", async () => {
    await failAt(
      { prepare: async () => ({ ok: false, reason: "unavailable" }) },
      "No pudimos guardar tu recuerdo. Intenta de nuevo más tarde.",
    )
  })

  it("unavailable when the upload to Cloudinary fails, without creating anything", async () => {
    const create = vi.fn()
    await failAt(
      { upload: async () => ({ ok: false, reason: "failed" }), create: create as never },
      "No pudimos guardar tu recuerdo. Intenta de nuevo más tarde.",
    )
    expect(create).not.toHaveBeenCalled()
  })

  it("unavailable when saving fails", async () => {
    await failAt(
      { create: async () => ({ ok: false, reason: "unavailable" }) },
      "No pudimos guardar tu recuerdo. Intenta de nuevo más tarde.",
    )
  })

  it("the server found the photo too large", async () => {
    await failAt({ create: async () => ({ ok: false, reason: "asset_too_large" }) }, "La foto supera los 10 MB.", "photo")
  })

  it("the server found the photo of a wrong type", async () => {
    await failAt(
      { create: async () => ({ ok: false, reason: "asset_type" }) },
      "Elige una foto JPG, PNG, WebP o HEIC.",
      "photo",
    )
  })

  it("the server found a validation error in the caption or the date", async () => {
    setup({ create: async () => ({ ok: false, reason: "invalid", errors: ["caption_empty", "date_in_future"] }) })
    filled()
    submit()
    expect(await screen.findByText("Escribe entre 1 y 140 caracteres.")).toBeTruthy()
    expect(screen.getByText("La fecha no puede ser futura.")).toBeTruthy()
  })

  it("a thrown action is unavailable too", async () => {
    await failAt(
      {
        prepare: async () => {
          throw new Error("network")
        },
      },
      "No pudimos guardar tu recuerdo. Intenta de nuevo más tarde.",
    )
  })
})

describe("AddMemory closing", () => {
  it("cancels an upload in flight when the form closes", async () => {
    let signal: AbortSignal | undefined
    const upload = vi.fn(
      ({ signal: s }: { signal?: AbortSignal }) =>
        new Promise<UploadResult>((resolve) => {
          signal = s
          s?.addEventListener("abort", () => resolve({ ok: false, reason: "cancelled" }))
        }),
    )
    const { create, onCreated } = setup({ upload: upload as never })
    filled()
    submit()
    await screen.findByRole("button", { name: /Subiendo/ })
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(signal?.aborted).toBe(true)
    expect(create).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it("does not close on Escape while the memory is being saved", async () => {
    let finishCreate!: (r: CreateMemoryResult) => void
    setup({ create: () => new Promise<CreateMemoryResult>((resolve) => (finishCreate = resolve)) })
    filled()
    submit()
    await screen.findByRole("button", { name: "Guardando…" })
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(screen.getByRole("dialog")).toBeTruthy()
    await act(async () => finishCreate({ ok: true, memory: MEMORY, locationSaved: false }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })
})

describe("AddMemory place section", () => {
  const checkbox = () => screen.getByRole("checkbox", { name: PLACE_COPY.consent }) as HTMLInputElement
  const HELP = "Guardamos dónde se sacó la foto para ubicar tu recuerdo en el universo."
  // What exifr reports for the photo: exact values, more than 2 decimals.
  const EXACT = { latitude: -34.593701, longitude: -58.425123 }

  const pickWithGps = (file = photo()) => {
    open()
    pick(file)
  }
  // The place is only named once the visitor ticks the consent.
  const tick = async () => fireEvent.click(await screen.findByRole("checkbox", { name: PLACE_COPY.consent }))
  const PLACE = "Parece que fue en Palermo, Buenos Aires"

  it("asks for a photo first, and always shows the helper text", () => {
    setup()
    open()
    expect(screen.getByText("¿Dónde se sacó?")).toBeTruthy()
    expect(screen.getByText(PLACE_COPY.idle)).toBeTruthy()
    expect(screen.getByText(HELP)).toBeTruthy()
    expect(screen.queryByRole("checkbox")).toBeNull()
  })

  it("says plainly that the exact place and its address will be seen by the people who can enter", () => {
    expect(PLACE_COPY.consent).toBe("Guardar el lugar exacto y su dirección. Lo verán las personas que pueden entrar.")
  })

  it("shows the street address under the suggested place", async () => {
    const { parseGps } = setup()
    parseGps.mockResolvedValue(EXACT)
    pickWithGps()
    await tick()
    expect(await screen.findByText(PLACE)).toBeTruthy()
    expect(screen.getByText("Honduras 4000, Buenos Aires")).toBeTruthy()
  })

  it("shows no address line when the street is unknown", async () => {
    const { parseGps, suggest } = setup()
    parseGps.mockResolvedValue(EXACT)
    suggest.mockResolvedValue({ ok: true, label: "Palermo, Buenos Aires", address: null })
    pickWithGps()
    await tick()
    expect(await screen.findByText(PLACE)).toBeTruthy()
    expect(document.getElementById("memory-place-address")).toBeNull()
  })

  it("shows the address of a pasted link under the link's own name", async () => {
    const { parseGps, resolveLink } = setup()
    parseGps.mockResolvedValue(EXACT)
    pickWithGps()
    await tick()
    await screen.findByText(PLACE)
    resolveLink.mockResolvedValue({ ok: true, lat: -34.58, lng: -58.42, label: "UOCRA", address: "Av. Rivadavia 1234, Junín" })
    fireEvent.change(screen.getByRole("textbox", { name: /link de Google Maps/ }), { target: { value: "https://maps.app.goo.gl/AbCd" } })
    expect(await screen.findByText("Según el link: UOCRA")).toBeTruthy()
    expect(screen.getByText("Av. Rivadavia 1234, Junín")).toBeTruthy()
    expect(screen.queryByText("Honduras 4000, Buenos Aires")).toBeNull()
  })

  it("sends the exact position to the suggestion call only once the visitor consents (6 decimals, as stored)", async () => {
    const { suggest, parseGps } = setup()
    parseGps.mockResolvedValue(EXACT)
    pickWithGps()
    await screen.findByText(PLACE_COPY.awaitingConsent)
    expect(suggest).not.toHaveBeenCalled()
    await tick()
    await waitFor(() => expect(suggest).toHaveBeenCalledWith({ lat: -34.593701, lng: -58.425123 }))
    expect(suggest).toHaveBeenCalledTimes(1)
  })

  it("before consent says the photo has a location and invites ticking the box, with no coordinates, label or map link", async () => {
    const { parseGps, suggest } = setup()
    parseGps.mockResolvedValue(EXACT)
    pickWithGps()
    expect(await screen.findByText(PLACE_COPY.awaitingConsent)).toBeTruthy()
    expect(checkbox().checked).toBe(false)
    expect(screen.queryByRole("link", { name: "Ver en el mapa" })).toBeNull()
    expect(document.body.textContent).not.toMatch(/34\.5|58\.4|Palermo|Cerca de/)
    expect(suggest).not.toHaveBeenCalled()
  })

  it("names the place once per photo however many times the consent is toggled", async () => {
    const { parseGps, suggest } = setup()
    parseGps.mockResolvedValue(EXACT)
    pickWithGps()
    await tick()
    await screen.findByText(PLACE)
    fireEvent.click(checkbox())
    fireEvent.click(checkbox())
    fireEvent.click(checkbox())
    expect(suggest).toHaveBeenCalledTimes(1)
    expect(screen.getByText(PLACE)).toBeTruthy()
  })

  it("sends nothing for a second photo picked before any consent", async () => {
    const { parseGps, suggest } = setup()
    parseGps.mockResolvedValue(EXACT)
    pickWithGps()
    await screen.findByText(PLACE_COPY.awaitingConsent)
    pick(photo({ name: "dos.jpg" }))
    await screen.findByText(PLACE_COPY.awaitingConsent)
    expect(suggest).not.toHaveBeenCalled()
  })

  it("suggests the place, with a safe link to check it on the map", async () => {
    const { parseGps } = setup()
    parseGps.mockResolvedValue(EXACT)
    pickWithGps()
    await tick()
    expect(await screen.findByText(PLACE)).toBeTruthy()
    const link = screen.getByRole("link", { name: "Ver en el mapa" }) as HTMLAnchorElement
    expect(link.getAttribute("href")).toBe("https://www.google.com/maps?q=-34.593701,-58.425123")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer")
  })

  it("shows the coordinates (2 decimals), and does not block, when the place has no name", async () => {
    const { parseGps, suggest, create } = setup()
    parseGps.mockResolvedValue(EXACT)
    suggest.mockResolvedValue({ ok: true, label: null, address: null })
    open()
    pick(photo())
    fill()
    await tick()
    expect(await screen.findByText("Cerca de -34.59, -58.43")).toBeTruthy()
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
  })

  it("falls back to the coordinates when the suggestion call fails", async () => {
    const { parseGps, suggest } = setup()
    parseGps.mockResolvedValue(EXACT)
    suggest.mockRejectedValue(new Error("down"))
    pickWithGps()
    await tick()
    expect(await screen.findByText("Cerca de -34.59, -58.43")).toBeTruthy()
  })

  it("shows a loading state while the place is being named", async () => {
    const { parseGps, suggest } = setup()
    parseGps.mockResolvedValue(EXACT)
    let finish!: (r: SuggestPlaceResult) => void
    suggest.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    pickWithGps()
    await tick()
    expect(await screen.findByText(PLACE_COPY.naming)).toBeTruthy()
    await act(async () => finish({ ok: true, label: "Palermo, Buenos Aires", address: "Honduras 4000, Buenos Aires" }))
    expect(await screen.findByText(PLACE)).toBeTruthy()
  })

  it("says so when the photo has no location", async () => {
    setup()
    pickWithGps()
    expect(await screen.findByText(PLACE_COPY.noGps)).toBeTruthy()
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.queryByRole("link", { name: "Ver en el mapa" })).toBeNull()
    expect(screen.getByText(HELP)).toBeTruthy()
  })

  it("treats a photo the parser cannot read like one with no location", async () => {
    const { parseGps } = setup()
    parseGps.mockRejectedValue(new Error("corrupt"))
    pickWithGps()
    expect(await screen.findByText(PLACE_COPY.noGps)).toBeTruthy()
  })

  it("offers an unchecked consent checkbox described by the helper text", async () => {
    const { parseGps } = setup()
    parseGps.mockResolvedValue(EXACT)
    pickWithGps()
    await screen.findByText(PLACE_COPY.awaitingConsent)
    expect(checkbox().checked).toBe(false)
    const ids = checkbox().getAttribute("aria-describedby")!.split(" ")
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain(HELP)
  })

  it("sends shareLocation false when left unchecked and true once ticked", async () => {
    const { parseGps, create } = setup()
    parseGps.mockResolvedValue(EXACT)
    open()
    pick(photo())
    fill()
    await tick()
    await screen.findByText(PLACE)
    expect(checkbox().checked).toBe(true)
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ shareLocation: true }))
  })

  it("can be unticked again before saving", async () => {
    const { parseGps, create } = setup()
    parseGps.mockResolvedValue(EXACT)
    open()
    pick(photo())
    fill()
    await tick()
    await screen.findByText(PLACE)
    fireEvent.click(checkbox())
    expect(checkbox().checked).toBe(false)
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ shareLocation: false }))
  })

  it("starts over, unchecked, when another photo is picked, and ignores a slow answer for the old one", async () => {
    const { parseGps, suggest } = setup()
    parseGps.mockResolvedValue(EXACT)
    let finishFirst!: (r: SuggestPlaceResult) => void
    suggest.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
    open()
    pick(photo({ name: "uno.jpg" }))
    await tick()
    await screen.findByText(PLACE_COPY.naming)

    parseGps.mockResolvedValue(undefined)
    pick(photo({ name: "dos.jpg" }))
    expect(await screen.findByText(PLACE_COPY.noGps)).toBeTruthy()
    await act(async () => finishFirst({ ok: true, label: "Palermo, Buenos Aires", address: "Honduras 4000, Buenos Aires" }))
    expect(screen.queryByText("Parece que fue en Palermo, Buenos Aires")).toBeNull()
    expect(screen.getByText(PLACE_COPY.noGps)).toBeTruthy()
  })

  it("resets the consent when another photo is picked", async () => {
    const { parseGps } = setup()
    parseGps.mockResolvedValue(EXACT)
    pickWithGps(photo({ name: "uno.jpg" }))
    await tick()
    await screen.findByText(PLACE)
    pick(photo({ name: "dos.jpg" }))
    await screen.findByText(PLACE_COPY.awaitingConsent)
    expect(checkbox().checked).toBe(false)
  })

  it("locks the checkbox while saving", async () => {
    const { parseGps } = setup({
      upload: (() => new Promise<UploadResult>(() => undefined)) as never,
    })
    parseGps.mockResolvedValue(EXACT)
    open()
    pick(photo())
    fill()
    await screen.findByText(PLACE_COPY.awaitingConsent)
    submit()
    await screen.findByRole("button", { name: /Subiendo/ })
    expect(checkbox().disabled).toBe(true)
  })

  it("says honestly when the place could not be saved", async () => {
    const { parseGps, create } = setup()
    parseGps.mockResolvedValue(EXACT)
    create.mockResolvedValue({ ok: true, memory: MEMORY, locationSaved: false })
    open()
    pick(photo())
    fill()
    await tick()
    submit()
    expect((await screen.findByRole("status")).textContent).toBe(
      "Listo. Tu recuerdo quedó pendiente de aprobación. No pudimos guardar el lugar.",
    )
  })

  it("never uses wording that suggests the visitor's own location", async () => {
    const { parseGps } = setup()
    parseGps.mockResolvedValue(EXACT)
    pickWithGps()
    await tick()
    await screen.findByText(PLACE)
    expect(document.body.textContent).not.toMatch(/desde dónde fue/i)
  })
})

describe("AddMemory Google Maps link", () => {
  const EXACT = { latitude: -34.593701, longitude: -58.425123 }
  const LINK = "https://maps.app.goo.gl/AbCd"
  const checkbox = () => screen.getByRole("checkbox", { name: PLACE_COPY.consent }) as HTMLInputElement
  const input = () => screen.getByRole("textbox", { name: /link de Google Maps/ }) as HTMLInputElement
  const paste = (value: string) => fireEvent.change(input(), { target: { value } })

  async function openWithGps(over: Partial<AddMemoryProps> = {}) {
    const ctx = setup(over)
    ctx.parseGps.mockResolvedValue(EXACT)
    open()
    pick(photo())
    fill()
    await screen.findByText(PLACE_COPY.awaitingConsent)
    return ctx
  }
  async function openWithoutGps(over: Partial<AddMemoryProps> = {}) {
    const ctx = setup(over)
    open()
    pick(photo())
    fill()
    await screen.findByText(PLACE_COPY.noGps)
    return ctx
  }

  it("offers the link input under the suggestion", async () => {
    await openWithGps()
    expect(screen.getByLabelText("¿No fue ahí? Pega un link de Google Maps")).toBe(input())
  })

  it("offers it when the photo has no location, with the invitation to paste one", async () => {
    await openWithoutGps()
    expect(screen.getByText(PLACE_COPY.noGps)).toBeTruthy()
    expect(screen.getByLabelText("Si quieres, pega un link de Google Maps")).toBe(input())
  })

  it("does not show the input before a photo is picked", () => {
    setup()
    open()
    expect(screen.queryByRole("textbox", { name: /link de Google Maps/ })).toBeNull()
  })

  it("links the input to the helper text through aria-describedby", async () => {
    await openWithGps()
    const ids = input().getAttribute("aria-describedby")!.split(" ")
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain(
      "Guardamos dónde se sacó la foto para ubicar tu recuerdo en el universo.",
    )
  })

  it("resolves a pasted link, shows its label instead of the suggestion, and ticks the consent", async () => {
    const { resolveLink } = await openWithGps()
    expect(checkbox().checked).toBe(false)
    paste(LINK)
    expect(await screen.findByText("Según el link: Plaza Italia")).toBeTruthy()
    expect(resolveLink).toHaveBeenCalledWith({ url: LINK })
    expect(screen.queryByText("Parece que fue en Palermo, Buenos Aires")).toBeNull()
    expect(checkbox().checked).toBe(true)
    const map = screen.getByRole("link", { name: "Ver en el mapa" }) as HTMLAnchorElement
    expect(map.getAttribute("href")).toBe("https://www.google.com/maps?q=-34.58,-58.42")
  })

  it("does not send the photo's own position when the consent came from a pasted link", async () => {
    const { suggest } = await openWithGps()
    paste(LINK)
    await screen.findByText("Según el link: Plaza Italia")
    expect(suggest).not.toHaveBeenCalled()
  })

  it("lets the visitor untick the consent that the link ticked", async () => {
    const { create } = await openWithGps()
    paste(LINK)
    await screen.findByText("Según el link: Plaza Italia")
    fireEvent.click(checkbox())
    expect(checkbox().checked).toBe(false)
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ shareLocation: false }))
  })

  it("sends the link to createMemory, which re-resolves it, with the consent", async () => {
    const { create } = await openWithGps()
    paste(`  ${LINK}  `)
    await screen.findByText("Según el link: Plaza Italia")
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith({
      ticket: "ticket-1",
      caption: "Una tarde de lluvia",
      happenedOn: "2024-03-12",
      shareLocation: true,
      mapsUrl: LINK,
      orbColor: SWATCHES[0],
    })
    // Only the link goes up, never the coordinates or the label the browser saw.
    expect(JSON.stringify(create.mock.calls)).not.toMatch(/Plaza Italia|-34\.58/)
  })

  it("shows the rounded coordinates when the link has no name", async () => {
    const { resolveLink } = await openWithoutGps()
    resolveLink.mockResolvedValue({ ok: true, lat: 40.71, lng: -74.01, label: null, address: null })
    paste(LINK)
    expect(await screen.findByText("Cerca de 40.71, -74.01")).toBeTruthy()
  })

  it("shows a loading state while the link is read", async () => {
    const { resolveLink } = await openWithGps()
    let finish!: (r: ResolveMapsLinkResult) => void
    resolveLink.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    paste(LINK)
    expect(await screen.findByText(PLACE_COPY.linkReading)).toBeTruthy()
    await act(async () => finish({ ok: true, lat: -34.58, lng: -58.42, label: "Plaza Italia", address: "Av. Rivadavia 1234, Buenos Aires" }))
    expect(await screen.findByText("Según el link: Plaza Italia")).toBeTruthy()
    expect(screen.queryByText(PLACE_COPY.linkReading)).toBeNull()
  })

  it.each([
    ["not_maps_link", "Ese link no parece de Google Maps."],
    ["unreadable", "No pudimos leer la ubicación de ese link."],
  ] as const)("shows the %s error, tied to the input", async (reason, message) => {
    const { resolveLink } = await openWithGps()
    resolveLink.mockResolvedValue({ ok: false, reason })
    paste("https://example.com")
    const error = await screen.findByText(message)
    expect(input().getAttribute("aria-invalid")).toBe("true")
    expect(input().getAttribute("aria-describedby")!.split(" ")).toContain(error.id)
    // The photo's place stays as it was (still waiting for consent), and the consent is not ticked.
    expect(screen.getByText(PLACE_COPY.awaitingConsent)).toBeTruthy()
    expect(checkbox().checked).toBe(false)
  })

  it("treats a failing or no-session answer as unreadable", async () => {
    const { resolveLink } = await openWithGps()
    resolveLink.mockRejectedValueOnce(new Error("down"))
    paste("https://example.com/a")
    expect(await screen.findByText("No pudimos leer la ubicación de ese link.")).toBeTruthy()
    resolveLink.mockResolvedValueOnce({ ok: false, reason: "no_session" })
    paste("https://example.com/b")
    await waitFor(() => expect(resolveLink).toHaveBeenCalledTimes(2))
    expect(await screen.findByText("No pudimos leer la ubicación de ese link.")).toBeTruthy()
  })

  it("goes back to the photo suggestion when the link is cleared", async () => {
    await openWithGps()
    paste(LINK)
    await screen.findByText("Según el link: Plaza Italia")
    paste("")
    expect(await screen.findByText("Parece que fue en Palermo, Buenos Aires")).toBeTruthy()
    expect(screen.queryByText("Según el link: Plaza Italia")).toBeNull()
  })

  it("removes the consent again when a link on a photo with no GPS is cleared", async () => {
    const { create } = await openWithoutGps()
    paste(LINK)
    await screen.findByText("Según el link: Plaza Italia")
    expect(checkbox().checked).toBe(true)
    paste("")
    await waitFor(() => expect(screen.queryByRole("checkbox")).toBeNull())
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ shareLocation: false }))
    expect(create.mock.calls[0][0]).not.toHaveProperty("mapsUrl")
  })

  it("keeps only the answer for the latest link", async () => {
    const { resolveLink } = await openWithGps()
    let finishFirst!: (r: ResolveMapsLinkResult) => void
    resolveLink.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
    paste("https://maps.app.goo.gl/First")
    await waitFor(() => expect(resolveLink).toHaveBeenCalledTimes(1))
    resolveLink.mockResolvedValueOnce({ ok: true, lat: 40.71, lng: -74.01, label: "Nueva York", address: null })
    paste("https://maps.app.goo.gl/Second")
    expect(await screen.findByText("Según el link: Nueva York")).toBeTruthy()
    await act(async () => finishFirst({ ok: true, lat: -34.58, lng: -58.42, label: "Plaza Italia", address: "Av. Rivadavia 1234, Buenos Aires" }))
    expect(screen.queryByText("Según el link: Plaza Italia")).toBeNull()
    expect(screen.getByText("Según el link: Nueva York")).toBeTruthy()
  })

  it("waits for the typing to pause before asking the server", async () => {
    const { resolveLink } = await openWithGps({ linkDebounceMs: 40 })
    paste("https://maps.app.goo.gl/A")
    paste("https://maps.app.goo.gl/AB")
    paste("https://maps.app.goo.gl/ABC")
    expect(resolveLink).not.toHaveBeenCalled()
    await waitFor(() => expect(resolveLink).toHaveBeenCalledTimes(1))
    expect(resolveLink).toHaveBeenCalledWith({ url: "https://maps.app.goo.gl/ABC" })
  })

  it("does not save while the link is unresolved or invalid, and says why", async () => {
    const { resolveLink, create } = await openWithGps()
    resolveLink.mockResolvedValue({ ok: false, reason: "not_maps_link" })
    paste("https://example.com")
    await screen.findByText("Ese link no parece de Google Maps.")
    submit()
    expect((await screen.findByRole("alert")).textContent).toBe(PLACE_COPY.linkBlocked)
    expect(create).not.toHaveBeenCalled()
    paste("")
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
  })

  it("starts over when another photo is picked", async () => {
    const { parseGps } = await openWithGps()
    paste(LINK)
    await screen.findByText("Según el link: Plaza Italia")
    parseGps.mockResolvedValue(EXACT)
    pick(photo({ name: "otra.jpg" }))
    expect(await screen.findByText(PLACE_COPY.awaitingConsent)).toBeTruthy()
    expect(input().value).toBe("")
    expect(checkbox().checked).toBe(false)
  })

  it("locks the input while saving", async () => {
    await openWithGps({ upload: (() => new Promise<UploadResult>(() => undefined)) as never })
    submit()
    await screen.findByRole("button", { name: /Subiendo/ })
    expect(input().disabled).toBe(true)
  })
})

describe("AddMemory orb color", () => {
  const group = () => screen.getByRole("radiogroup", { name: ORB_COLOR_COPY.label })
  const swatches = () => within(group()).getAllByRole("radio") as HTMLButtonElement[]
  const ready = async () => screen.findByRole("radiogroup", { name: ORB_COLOR_COPY.label })

  it("asks for a photo first, with the preview and the swatch row already in place", () => {
    setup()
    open()
    expect(screen.getByText(ORB_COLOR_COPY.idle)).toBeTruthy()
    expect(screen.queryByRole("radiogroup")).toBeNull()
    expect(screen.getByTestId("orb-preview")).toBeTruthy()
  })

  it("takes the swatches from the picked photo, the dominant tone first and selected", async () => {
    const { readPalette } = setup()
    open()
    const file = photo()
    pick(file)
    await ready()
    expect(readPalette).toHaveBeenCalledWith(file)
    expect(swatches().map((r) => r.getAttribute("data-color"))).toEqual(SWATCHES)
    expect(swatches().map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false", "false"])
    expect(screen.getByText(ORB_COLOR_COPY.fromPhoto)).toBeTruthy()
  })

  it("shows a live preview in the chosen color", async () => {
    setup()
    open()
    pick(photo())
    await ready()
    const orb = () => screen.getByTestId("orb-preview").querySelector(".mem-dot") as HTMLElement
    expect(orb().style.getPropertyValue("--pc")).toBe(SWATCHES[0])
    fireEvent.click(swatches()[2])
    expect(orb().style.getPropertyValue("--pc")).toBe(SWATCHES[2])
  })

  it("moves the selection with the arrow keys", async () => {
    setup()
    open()
    pick(photo())
    await ready()
    swatches()[0].focus()
    fireEvent.keyDown(swatches()[0], { key: "ArrowRight" })
    expect(swatches()[1].getAttribute("aria-checked")).toBe("true")
    expect(document.activeElement).toBe(swatches()[1])
    fireEvent.keyDown(swatches()[1], { key: "ArrowLeft" })
    fireEvent.keyDown(swatches()[0], { key: "ArrowLeft" })
    expect(swatches()[3].getAttribute("aria-checked")).toBe("true")
  })

  it("sends the chosen color with the memory", async () => {
    const { create } = setup()
    open()
    pick(photo())
    fill()
    await ready()
    fireEvent.click(swatches()[1])
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ orbColor: SWATCHES[1] }))
  })

  it("sends the dominant tone when the visitor never touched the swatches", async () => {
    const { create } = setup()
    open()
    pick(photo())
    fill()
    await ready()
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ orbColor: SWATCHES[0] }))
  })

  it("says so, and offers the site's cool swatches, when the browser cannot draw the photo (HEIC)", async () => {
    const { create, readPalette } = setup()
    readPalette.mockResolvedValue({ colors: ["#7ee0f2", "#8ab4ff", "#b49cff"], fromPhoto: false })
    open()
    pick(photo({ name: "IMG_1.HEIC", type: "image/heic" }))
    fill()
    await ready()
    expect(screen.getByText(ORB_COLOR_COPY.fallback)).toBeTruthy()
    expect(swatches()).toHaveLength(3)
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ orbColor: "#7ee0f2" }))
  })

  it("starts over with the new photo's colors, and ignores a slow answer for the old one", async () => {
    const { readPalette } = setup()
    let finishFirst!: (p: PhotoPalette) => void
    readPalette.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
    open()
    pick(photo({ name: "uno.jpg" }))
    expect(screen.getByText(ORB_COLOR_COPY.reading)).toBeTruthy()

    readPalette.mockResolvedValueOnce({ colors: ["#ffe14d", "#8fe08a"], fromPhoto: true })
    pick(photo({ name: "dos.jpg" }))
    await waitFor(() => expect(swatches()).toHaveLength(2))
    await act(async () => finishFirst({ colors: SWATCHES, fromPhoto: true }))
    expect(swatches().map((r) => r.getAttribute("data-color"))).toEqual(["#ffe14d", "#8fe08a"])
    expect(swatches()[0].getAttribute("aria-checked")).toBe("true")
  })

  it("drops the swatches when the new photo is refused", async () => {
    setup()
    open()
    pick(photo())
    await ready()
    pick(photo({ name: "a.gif", type: "image/gif" }))
    expect(screen.queryByRole("radiogroup")).toBeNull()
    expect(screen.getByText(ORB_COLOR_COPY.idle)).toBeTruthy()
  })

  it("locks the swatches while saving", async () => {
    setup({ upload: (() => new Promise<UploadResult>(() => undefined)) as never })
    open()
    pick(photo())
    fill()
    await ready()
    submit()
    await screen.findByRole("button", { name: /Subiendo/ })
    for (const swatch of swatches()) expect(swatch.disabled).toBe(true)
  })
})

describe("AddMemory layout", () => {
  const dialog = () => screen.getByRole("dialog")
  const scroller = () => screen.getByTestId("memory-scroll")

  it("has exactly one scroll region for the fields, which does not chain scrolling to the page", () => {
    setup()
    open()
    const scrollers = Array.from(dialog().querySelectorAll<HTMLElement>("*")).filter((el) =>
      /(^|\s)(overflow-y-auto|overflow-y-scroll|overflow-auto|overflow-scroll)(\s|$)/.test(el.className?.toString() ?? ""),
    )
    expect(scrollers).toEqual([scroller()])
    expect(scroller().className).toContain("overscroll-contain")
    expect(scroller().className).toContain("min-h-0")
  })

  it("keeps the card itself from scrolling or bleeding past the sheet", () => {
    setup()
    open()
    const card = scroller().closest("[data-testid='memory-card']") as HTMLElement
    expect(card.className).toContain("overflow-hidden")
  })

  it("gives the card a fixed height, inside the safe areas, so it never resizes when the preview or the place appear", () => {
    setup()
    open()
    const card = screen.getByTestId("memory-card")
    // Phones: the sheet's height is the viewport minus the top safe area. Desktop: capped, so it fits 1280x720.
    expect(card.className).toMatch(/(^|\s)h-\[calc\(100%-max\(0\.5rem,env\(safe-area-inset-top\)\)\)\]/)
    expect(card.className).toMatch(/md:h-\[min\(100%,\d+px\)\]/)
    expect(card.className).not.toMatch(/(^|\s)max-h-/)
  })

  it("keeps the caption counter inside the field, so the caption block does not take an extra row", () => {
    setup()
    open()
    const caption = screen.getByLabelText("¿Qué recuerdas?")
    expect(caption.parentElement?.contains(screen.getByText("0/140"))).toBe(true)
    expect(caption.parentElement?.className).toContain("relative")
  })

  it("keeps every field inside the scroll region and the submit outside it, always reachable", () => {
    setup()
    open()
    for (const label of ["Foto", "¿Qué recuerdas?", "¿Cuándo fue?"]) {
      expect(scroller().contains(screen.getByLabelText(label))).toBe(true)
    }
    expect(scroller().contains(screen.getByRole("group", { name: PLACE_COPY.heading }))).toBe(true)
    const actions = screen.getByTestId("memory-actions")
    const submitButton = screen.getByRole("button", { name: "Guardar recuerdo" })
    expect(actions.contains(submitButton)).toBe(true)
    expect(scroller().contains(actions)).toBe(false)
    expect(actions.className).toContain("shrink-0")
    expect(actions.className).toContain("pb-[max(")
  })

  it("keeps the single phone column as wide as the sheet, whatever the swatches or the hints want (no sideways overflow)", () => {
    setup()
    open()
    expect(screen.getByTestId("memory-columns").className).toContain(" grid-cols-[minmax(0,1fr)] ")
  })

  it("lays the fields out in two columns on desktop: photo and color on the left, the rest on the right", () => {
    setup()
    open()
    const columns = screen.getByTestId("memory-columns")
    expect(columns.className).toMatch(/md:grid-cols-/)
    const [left, right] = Array.from(columns.children) as HTMLElement[]
    expect(left.contains(screen.getByLabelText("Foto"))).toBe(true)
    expect(left.contains(screen.getByTestId("orb-preview"))).toBe(true)
    expect(left.contains(screen.getByText(ORB_COLOR_COPY.label))).toBe(true)
    expect(right.contains(screen.getByLabelText("¿Qué recuerdas?"))).toBe(true)
    expect(right.contains(screen.getByLabelText("¿Cuándo fue?"))).toBe(true)
    expect(right.contains(screen.getByRole("group", { name: PLACE_COPY.heading }))).toBe(true)
  })

  it("puts the submit under the right column on desktop", () => {
    setup()
    open()
    const actions = screen.getByTestId("memory-actions")
    expect(actions.className).toMatch(/md:grid-cols-/)
    const cells = Array.from(actions.children) as HTMLElement[]
    expect(cells[cells.length - 1].contains(screen.getByRole("button", { name: "Guardar recuerdo" }))).toBe(true)
  })

  it("is a bottom sheet on phones, with a decorative grab handle", () => {
    setup()
    open()
    expect(dialog().className).toContain("items-end")
    expect(dialog().className).toContain("md:items-center")
    expect(dialog().className).toContain("overscroll-contain")
    const card = screen.getByTestId("memory-card")
    expect(card.className).toContain("rounded-t-")
    const handle = screen.getByTestId("sheet-handle")
    expect(handle.getAttribute("aria-hidden")).toBe("true")
    expect(handle.className).toContain("md:hidden")
  })

  it("keeps the photo box the same size before and after a photo is picked, so nothing jumps", () => {
    setup()
    open()
    const zone = screen.getByTestId("photo-drop")
    const before = zone.className
    pick(photo())
    expect(screen.getByTestId("photo-drop").className).toBe(before)
    expect(before).toMatch(/(^|\s)h-\d+/)
  })

  it("shows form errors and the confirmation next to the submit, never out of sight in the scroll region", async () => {
    setup({ create: async () => ({ ok: false, reason: "unavailable" }) })
    open()
    pick(photo())
    fill()
    submit()
    const alert = await screen.findByRole("alert")
    expect(screen.getByTestId("memory-actions").contains(alert)).toBe(true)
    expect(scroller().contains(alert)).toBe(false)
  })

  it("moves focus into the dialog when it opens and closes on Escape", async () => {
    setup()
    open()
    expect(dialog().contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(dialog(), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })
})

describe("AddMemory with a virtual keyboard", () => {
  it("shrinks the sheet to the part of the page the keyboard leaves free, so the focused field and the submit stay visible", () => {
    const visual = new EventTarget() as EventTarget & { height: number; offsetTop: number }
    visual.height = window.innerHeight - 300
    visual.offsetTop = 0
    vi.stubGlobal("visualViewport", visual)
    setup()
    open()
    const content = screen.getByTestId("memory-card").parentElement as HTMLElement
    expect(content.style.paddingBottom).toBe("300px")
  })

  it("brings the field being typed in into view when the keyboard opens", () => {
    const visual = new EventTarget() as EventTarget & { height: number; offsetTop: number }
    visual.height = window.innerHeight
    visual.offsetTop = 0
    vi.stubGlobal("visualViewport", visual)
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    setup()
    open()
    const caption = screen.getByLabelText("¿Qué recuerdas?")
    caption.focus()
    act(() => {
      visual.height = window.innerHeight - 300
      visual.dispatchEvent(new Event("resize"))
    })
    expect(scrollIntoView).toHaveBeenCalled()
    expect(scrollIntoView.mock.contexts).toContain(caption)
    Reflect.deleteProperty(Element.prototype, "scrollIntoView")
  })

  it("uses the whole page when there is no keyboard", () => {
    setup()
    open()
    const content = screen.getByTestId("memory-card").parentElement as HTMLElement
    expect(content.style.paddingBottom).toBe("")
  })

  it("compacts the header and the footer on a short screen (a phone in landscape), so the fields keep most of the card", () => {
    setup()
    open()
    const short = "[@media(max-height:520px)]"
    const header = screen.getByRole("heading", { name: "Contribuir con un recuerdo" })
    expect(header.className).toContain(`${short}:text-`)
    expect(screen.getByText(/Una foto, un audio o ambos/).className).toContain(`${short}:sr-only`)
    expect(screen.getByTestId("memory-actions").className).toContain(`${short}:pt-2`)
    // A shorter photo box lifts the audio section into view without scrolling.
    expect(screen.getByTestId("photo-drop").className).toContain(`${short}:h-20`)
  })

  it("is a plus and the word Contribuir, with the same label for the magnetic cursor", () => {
    setup()
    const trigger = screen.getByRole("button", { name: "Contribuir" })
    expect(trigger.textContent).toBe("Contribuir")
    expect(trigger.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
    expect(trigger.getAttribute("data-cursor-label")).toBe("Contribuir")
    expect(screen.queryByRole("button", { name: "Agregar recuerdo" })).toBeNull()
  })

  it("makes the control to open it at least 44 px tall on a phone", () => {
    setup()
    expect(screen.getByRole("button", { name: "Contribuir" }).className).toMatch(/(^|\s)h-11(\s|$)/)
  })
})

describe("AddMemory contributed from a memory", () => {
  const RELATED = {
    id: "5b8f0c5e-6d7a-4b1c-9d2e-3f4a5b6c7d8e",
    caption: "La casa nueva",
    happenedOn: "2023-07-04",
    place: "UOCRA · Av. Rivadavia 1234, Junín",
  }
  const dialog = () => screen.getByRole("dialog")
  const sameCheckbox = () => within(dialog()).getByRole("checkbox", { name: /Mismo lugar/ }) as HTMLInputElement
  const createdWith = (create: ReturnType<typeof setup>["create"]) => create.mock.calls[0][0]

  it("opens straight away when it is controlled open, and reports a close", async () => {
    const onOpenChange = vi.fn()
    setup({ open: true, onOpenChange, related: RELATED })
    expect(screen.getByRole("dialog", { name: "Contribuir con un recuerdo" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("asks to open from its own control when it is controlled", () => {
    const onOpenChange = vi.fn()
    setup({ open: false, onOpenChange })
    open()
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("starts the date at the date of that memory, and the visitor can change it", async () => {
    const { create } = setup({ open: true, related: RELATED })
    const date = screen.getByLabelText("¿Cuándo fue?") as HTMLInputElement
    expect(date.value).toBe("2023-07-04")
    fireEvent.change(date, { target: { value: "2023-07-05" } })
    pick(photo())
    fireEvent.change(screen.getByLabelText("¿Qué recuerdas?"), { target: { value: "El día después" } })
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(createdWith(create)).toMatchObject({ happenedOn: "2023-07-05", relatedMemoryId: RELATED.id })
  })

  it("shows a chip that says what it is related to", () => {
    setup({ open: true, related: RELATED })
    expect(within(dialog()).getByText("Relacionado con «La casa nueva»")).toBeTruthy()
  })

  it("lets the visitor remove the relation, and then sends none (the date they have stays)", async () => {
    const { create } = setup({ open: true, related: RELATED })
    fireEvent.click(within(dialog()).getByRole("button", { name: "Quitar relación" }))
    expect(within(dialog()).queryByText(/Relacionado con/)).toBeNull()
    expect(within(dialog()).queryByRole("checkbox", { name: /Mismo lugar/ })).toBeNull()
    expect((screen.getByLabelText("¿Cuándo fue?") as HTMLInputElement).value).toBe("2023-07-04")
    pick(photo())
    fill("Algo", "2023-07-04")
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(createdWith(create)).not.toHaveProperty("relatedMemoryId")
    expect(createdWith(create)).not.toHaveProperty("samePlace")
  })

  it("makes the chip's remove control a 44 px target", () => {
    setup({ open: true, related: RELATED })
    expect(within(dialog()).getByRole("button", { name: "Quitar relación" }).className).toMatch(/(^|\s)h-11(\s|$)/)
  })

  it("has no chip, no Mismo lugar and an empty date for a contribution that starts from nowhere", () => {
    setup()
    open()
    expect(within(dialog()).queryByText(/Relacionado con/)).toBeNull()
    expect(within(dialog()).queryByRole("checkbox", { name: /Mismo lugar/ })).toBeNull()
    expect((screen.getByLabelText("¿Cuándo fue?") as HTMLInputElement).value).toBe("")
    expect(within(dialog()).getByText(/Tu recuerdo aparecerá en el espacio/)).toBeTruthy()
  })

  describe("Mismo lugar", () => {
    it("is offered, unticked, with the place of that memory", () => {
      setup({ open: true, related: RELATED })
      expect(sameCheckbox().checked).toBe(false)
      expect(within(dialog()).getByText("UOCRA · Av. Rivadavia 1234, Junín")).toBeTruthy()
    })

    it("is not offered when that memory has no place", () => {
      setup({ open: true, related: { ...RELATED, place: null } })
      expect(within(dialog()).queryByRole("checkbox", { name: /Mismo lugar/ })).toBeNull()
    })

    it("asks the server to copy the place when it is ticked, and sends no coordinates", async () => {
      const { create } = setup({ open: true, related: RELATED })
      fireEvent.click(sameCheckbox())
      pick(photo())
      fill("Otra vez ahí", "2023-07-04")
      submit()
      await waitFor(() => expect(create).toHaveBeenCalled())
      expect(createdWith(create)).toMatchObject({ relatedMemoryId: RELATED.id, samePlace: true, shareLocation: false })
      expect(JSON.stringify(createdWith(create))).not.toMatch(/latitude|longitude|lat"|lng"/)
    })

    it("does not ask for it when it is left unticked", async () => {
      const { create } = setup({ open: true, related: RELATED })
      pick(photo())
      fill("Otra vez ahí", "2023-07-04")
      submit()
      await waitFor(() => expect(create).toHaveBeenCalled())
      expect(createdWith(create)).not.toHaveProperty("samePlace")
    })

    it("is dropped when the photo's own place is kept instead", async () => {
      const { parseGps } = setup({ open: true, related: RELATED })
      parseGps.mockResolvedValue({ latitude: -34.5937, longitude: -58.4215 })
      fireEvent.click(sameCheckbox())
      pick(photo())
      const keep = await screen.findByRole("checkbox", { name: PLACE_COPY.consent })
      fireEvent.click(keep)
      expect(sameCheckbox().checked).toBe(false)
      expect((keep as HTMLInputElement).checked).toBe(true)
    })

    it("drops the photo's consent when it is ticked", async () => {
      const { parseGps } = setup({ open: true, related: RELATED })
      parseGps.mockResolvedValue({ latitude: -34.5937, longitude: -58.4215 })
      pick(photo())
      const keep = (await screen.findByRole("checkbox", { name: PLACE_COPY.consent })) as HTMLInputElement
      fireEvent.click(keep)
      expect(keep.checked).toBe(true)
      fireEvent.click(sameCheckbox())
      expect(sameCheckbox().checked).toBe(true)
      expect(keep.checked).toBe(false)
    })

    it("is dropped when a pasted Maps link resolves (the link is the visitor choosing another place)", async () => {
      setup({ open: true, related: RELATED })
      fireEvent.click(sameCheckbox())
      pick(photo())
      fireEvent.change(await screen.findByRole("textbox", { name: /link de Google Maps/ }), {
        target: { value: "https://maps.app.goo.gl/AbCd" },
      })
      await waitFor(() => expect(sameCheckbox().checked).toBe(false))
    })

    it("goes with the relation when it is removed", () => {
      setup({ open: true, related: RELATED })
      fireEvent.click(sameCheckbox())
      fireEvent.click(within(dialog()).getByRole("button", { name: "Quitar relación" }))
      expect(within(dialog()).queryByRole("checkbox", { name: /Mismo lugar/ })).toBeNull()
    })

    it("says so when the place could not be kept", async () => {
      const { create } = setup({ open: true, related: RELATED })
      create.mockResolvedValueOnce({ ok: true, memory: MEMORY, locationSaved: false })
      fireEvent.click(sameCheckbox())
      pick(photo())
      fill("Otra vez ahí", "2023-07-04")
      submit()
      await waitFor(() => expect(within(dialog()).getByRole("status").textContent).toContain(PLACE_COPY.notSaved))
    })
  })
})
