import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import { MAX_UPLOAD_BYTES } from "../upload-limits"
import type { CreateMemoryResult, PrepareUploadResult } from "../upload-view"
import type { SuggestPlaceResult } from "../place/suggest-place"
import { AddMemory, type AddMemoryProps } from "./add-memory"
import type { UploadResult } from "./cloudinary-upload"
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
  upload: { cloudName: "demo", ticket: "ticket-1", fields: { api_key: "k", signature: "s" } },
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
  thumbUrl: "https://res.cloudinary.com/demo/t",
  fullUrl: "https://res.cloudinary.com/demo/f",
}

function setup(over: Partial<AddMemoryProps> = {}) {
  const prepare = vi.fn(async (): Promise<PrepareUploadResult> => GRANT)
  const upload = vi.fn(async (): Promise<UploadResult> => ({ ok: true }))
  const create = vi.fn(async (): Promise<CreateMemoryResult> => ({ ok: true, memory: MEMORY, locationSaved: false }))
  // The photo has no GPS unless a test says so; the answer is what exifr reports, with its exact decimals.
  const parseGps = vi.fn(async (): Promise<{ latitude: number; longitude: number } | undefined> => undefined)
  const suggest = vi.fn(async (): Promise<SuggestPlaceResult> => ({ ok: true, label: "Palermo, Buenos Aires" }))
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
          onCreated={onCreated}
          today="2026-10-01"
          doneDelayMs={20}
          {...over}
        />
      </div>
    )
  }
  render(<Stage />)
  return { prepare, upload, create, onCreated, parseGps, suggest }
}

const open = () => fireEvent.click(screen.getByRole("button", { name: "Agregar recuerdo" }))
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
  it("opens from the Agregar recuerdo control into a titled, described dialog", () => {
    setup()
    expect(screen.queryByRole("dialog")).toBeNull()
    open()
    const dialog = screen.getByRole("dialog", { name: "Agregar recuerdo" })
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy()
    expect(within(dialog).getByText(/pendiente|aprobad/i)).toBeTruthy()
  })

  it("sets the title in Gambarino through the title role", () => {
    setup()
    open()
    expect(screen.getByRole("heading", { name: "Agregar recuerdo" }).className).toContain("t-title")
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
    const trigger = screen.getByRole("button", { name: "Agregar recuerdo" })
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

  it("returns focus to the Agregar recuerdo control when it closes", async () => {
    setup()
    const trigger = screen.getByRole("button", { name: "Agregar recuerdo" })
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
    expect(screen.getByText("Elige una foto JPG, PNG, WebP o HEIC.")).toBeTruthy()
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
  const checkbox = () => screen.getByRole("checkbox", { name: "Guardar dónde se sacó la foto" }) as HTMLInputElement
  const HELP = "Solo guardamos una ubicación aproximada (unos 1 km), nunca la exacta."
  // What exifr reports for the photo: exact values, more than 2 decimals.
  const EXACT = { latitude: -34.593701, longitude: -58.425123 }

  const pickWithGps = (file = photo()) => {
    open()
    pick(file)
  }

  it("asks for a photo first, and always shows the helper text", () => {
    setup()
    open()
    expect(screen.getByText("¿Dónde se sacó?")).toBeTruthy()
    expect(screen.getByText(PLACE_COPY.idle)).toBeTruthy()
    expect(screen.getByText(HELP)).toBeTruthy()
    expect(screen.queryByRole("checkbox")).toBeNull()
  })

  it("rounds to 2 decimals before anything leaves the browser", async () => {
    const { suggest, parseGps } = setup()
    parseGps.mockResolvedValue(EXACT)
    pickWithGps()
    await waitFor(() => expect(suggest).toHaveBeenCalledWith({ lat: -34.59, lng: -58.43 }))
    expect(JSON.stringify(suggest.mock.calls)).not.toMatch(/34\.5937|58\.4251/)
  })

  it("suggests the place, with a safe link to check it on the map", async () => {
    const { parseGps } = setup()
    parseGps.mockResolvedValue(EXACT)
    pickWithGps()
    expect(await screen.findByText("Parece que fue en Palermo, Buenos Aires")).toBeTruthy()
    const link = screen.getByRole("link", { name: "Ver en el mapa" }) as HTMLAnchorElement
    expect(link.getAttribute("href")).toBe("https://www.google.com/maps?q=-34.59,-58.43")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer")
  })

  it("shows the rounded coordinates, and does not block, when the place has no name", async () => {
    const { parseGps, suggest, create } = setup()
    parseGps.mockResolvedValue(EXACT)
    suggest.mockResolvedValue({ ok: true, label: null })
    open()
    pick(photo())
    fill()
    expect(await screen.findByText("Cerca de -34.59, -58.43")).toBeTruthy()
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
  })

  it("falls back to the coordinates when the suggestion call fails", async () => {
    const { parseGps, suggest } = setup()
    parseGps.mockResolvedValue(EXACT)
    suggest.mockRejectedValue(new Error("down"))
    pickWithGps()
    expect(await screen.findByText("Cerca de -34.59, -58.43")).toBeTruthy()
  })

  it("shows a loading state while the place is being named", async () => {
    const { parseGps, suggest } = setup()
    parseGps.mockResolvedValue(EXACT)
    let finish!: (r: { ok: true; label: string }) => void
    suggest.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    pickWithGps()
    expect(await screen.findByText(PLACE_COPY.naming)).toBeTruthy()
    await act(async () => finish({ ok: true, label: "Palermo, Buenos Aires" }))
    expect(await screen.findByText("Parece que fue en Palermo, Buenos Aires")).toBeTruthy()
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
    await screen.findByText("Parece que fue en Palermo, Buenos Aires")
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
    await screen.findByText("Parece que fue en Palermo, Buenos Aires")
    fireEvent.click(checkbox())
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
    await screen.findByText("Parece que fue en Palermo, Buenos Aires")
    fireEvent.click(checkbox())
    fireEvent.click(checkbox())
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ shareLocation: false }))
  })

  it("starts over, unchecked, when another photo is picked, and ignores a slow answer for the old one", async () => {
    const { parseGps, suggest } = setup()
    parseGps.mockResolvedValue(EXACT)
    let finishFirst!: (r: { ok: true; label: string }) => void
    suggest.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
    open()
    pick(photo({ name: "uno.jpg" }))
    await screen.findByText(PLACE_COPY.naming)

    parseGps.mockResolvedValue(undefined)
    pick(photo({ name: "dos.jpg" }))
    expect(await screen.findByText(PLACE_COPY.noGps)).toBeTruthy()
    await act(async () => finishFirst({ ok: true, label: "Palermo, Buenos Aires" }))
    expect(screen.queryByText("Parece que fue en Palermo, Buenos Aires")).toBeNull()
    expect(screen.getByText(PLACE_COPY.noGps)).toBeTruthy()
  })

  it("resets the consent when another photo is picked", async () => {
    const { parseGps } = setup()
    parseGps.mockResolvedValue(EXACT)
    pickWithGps(photo({ name: "uno.jpg" }))
    await screen.findByText("Parece que fue en Palermo, Buenos Aires")
    fireEvent.click(checkbox())
    pick(photo({ name: "dos.jpg" }))
    await screen.findByText("Parece que fue en Palermo, Buenos Aires")
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
    await screen.findByText("Parece que fue en Palermo, Buenos Aires")
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
    await screen.findByText("Parece que fue en Palermo, Buenos Aires")
    fireEvent.click(checkbox())
    submit()
    expect((await screen.findByRole("status")).textContent).toBe(
      "Listo. Tu recuerdo quedó pendiente de aprobación. No pudimos guardar el lugar.",
    )
  })

  it("never uses wording that suggests the visitor's own location", async () => {
    const { parseGps } = setup()
    parseGps.mockResolvedValue(EXACT)
    pickWithGps()
    await screen.findByText("Parece que fue en Palermo, Buenos Aires")
    expect(document.body.textContent).not.toMatch(/desde dónde fue/i)
  })
})
