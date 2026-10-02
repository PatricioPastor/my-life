import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import { MAX_AUDIO_BYTES, MAX_AUDIO_MS } from "../upload-limits"
import type { CreateMemoryResult, PrepareUploadResult } from "../upload-view"
import type { ResolveMapsLinkResult } from "../place/resolve-maps-link"
import type { SuggestPlaceResult } from "../place/suggest-place"
import { AddMemory, type AddMemoryProps } from "./add-memory"
import { RECORDER_COPY } from "./audio-recorder-model"
import { AUDIO_COPY } from "./audio-section"
import type { UploadResult } from "./cloudinary-upload"
import { COPY } from "./memory-form-model"
import { ORB_COLOR_COPY } from "./orb-color-picker"
import { fallbackPalette, type PhotoPalette } from "./photo-palette"
import type { RecorderEnv } from "./use-audio-recorder"

const track = vi.fn()
vi.mock("@/shared/analytics", () => ({ track: (...args: unknown[]) => track(...args) }))

beforeEach(() => {
  vi.stubGlobal("matchMedia", undefined)
  vi.stubGlobal("requestAnimationFrame", () => 1)
  vi.stubGlobal("cancelAnimationFrame", () => {})
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }))
})
afterEach(() => {
  cleanup()
  track.mockReset()
  vi.unstubAllGlobals()
})

const MEMORY: MemoryView = {
  id: "new",
  caption: "Mi voz",
  happenedOn: "2024-03-12",
  status: "pending",
  width: null,
  height: null,
  kind: "image",
  takenAt: null,
  dominantColor: null,
  place: null,
  orbColor: "#8ab4ff",
  viewCount: 0,

  relatedId: null,
  thumbUrl: null,
  fullUrl: null,
  audio: { url: "https://res.cloudinary.com/demo/video/authenticated/s--x--/f_mp3/a", durationMs: 4000 },
}
const SWATCHES = ["#ff9a3c", "#a58cff", "#4fd1b9", "#e88ad6"]

type Handler = ((event?: unknown) => void) | null
class FakeMediaRecorder {
  static isTypeSupported = () => true
  state: "inactive" | "recording" = "inactive"
  mimeType: string
  ondataavailable: Handler = null
  onstop: Handler = null
  onerror: Handler = null
  constructor(
    readonly stream: MediaStream,
    options?: { mimeType?: string },
  ) {
    this.mimeType = options?.mimeType ?? "audio/webm"
  }
  start() {
    this.state = "recording"
  }
  stop() {
    this.state = "inactive"
    this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType }) })
    this.onstop?.()
  }
}
let tracks: Array<{ stop: ReturnType<typeof vi.fn> }>
const micEnv = (over: Partial<RecorderEnv> = {}): RecorderEnv => ({
  getUserMedia: vi.fn(async () => ({ getTracks: () => tracks }) as unknown as MediaStream),
  recorder: FakeMediaRecorder as unknown as RecorderEnv["recorder"],
  now: () => Date.now(),
  ...over,
})

function setup(over: Partial<AddMemoryProps> = {}) {
  tracks = [{ stop: vi.fn() }]
  const prepare = vi.fn<AddMemoryProps["prepare"]>(
    async (input): Promise<PrepareUploadResult> => ({
      ok: true,
      upload: {
        cloudName: "demo",
        ticket: "ticket-1",
        photo: input.photo ? { api_key: "k", signature: "s", public_id: "photo" } : null,
        audio: input.audio ? { api_key: "k", signature: "sa", public_id: "audio" } : null,
      },
    }),
  )
  const upload = vi.fn<AddMemoryProps["upload"]>(async (): Promise<UploadResult> => ({ ok: true }))
  const create = vi.fn<AddMemoryProps["create"]>(async (): Promise<CreateMemoryResult> => ({ ok: true, memory: MEMORY, locationSaved: false }))
  const readAudioDuration = vi.fn<NonNullable<AddMemoryProps["readAudioDuration"]>>(async () => 5000)
  const readPalette = vi.fn(async (): Promise<PhotoPalette> => ({ colors: SWATCHES, fromPhoto: true }))
  const onCreated = vi.fn()
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
          suggest={async (): Promise<SuggestPlaceResult> => ({ ok: true, label: "Palermo", address: null })}
          resolveLink={async (): Promise<ResolveMapsLinkResult> => ({ ok: true, lat: -34.58, lng: -58.42, label: "Plaza Italia", address: null })}
          readPalette={readPalette}
          readAudioDuration={readAudioDuration}
          levelEnv={{ createContext: () => null }}
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
  return { prepare, upload, create, onCreated, readAudioDuration, readPalette }
}

const open = () => fireEvent.click(screen.getByRole("button", { name: "Contribuir" }))
const photo = (over: Partial<{ name: string; type: string; size: number }> = {}) => {
  const { name = "foto.jpg", type = "image/jpeg", size = 2000 } = over
  const file = new File(["x"], name, { type })
  Object.defineProperty(file, "size", { value: size })
  return file
}
const audioFile = (over: Partial<{ name: string; type: string; size: number }> = {}) => {
  const { name = "nota.mp3", type = "audio/mpeg", size = 4000 } = over
  const file = new File(["x"], name, { type })
  Object.defineProperty(file, "size", { value: size })
  return file
}
const pickPhoto = (file: File) => fireEvent.change(screen.getByLabelText("Foto"), { target: { files: [file] } })
const pickAudio = (file: File) => fireEvent.change(screen.getByLabelText("Subir audio"), { target: { files: [file] } })
const fill = (caption = "Mi voz", date = "2024-03-12") => {
  fireEvent.change(screen.getByLabelText("¿Qué recuerdas?"), { target: { value: caption } })
  fireEvent.change(screen.getByLabelText("¿Cuándo fue?"), { target: { value: date } })
}
const submit = () => fireEvent.click(screen.getByRole("button", { name: /Guardar recuerdo|Subiendo|Guardando/ }))
const heard = () => screen.findByRole("button", { name: "Escuchar" })
const group = () => screen.getByRole("group", { name: AUDIO_COPY.label })
const swatches = () => within(screen.getByRole("radiogroup", { name: ORB_COLOR_COPY.label })).getAllByRole("radio") as HTMLButtonElement[]

async function record() {
  fireEvent.click(screen.getByRole("button", { name: "Grabar" }))
  await screen.findByRole("timer")
  fireEvent.click(screen.getByRole("button", { name: "Detener" }))
  await heard()
}

describe("AddMemory: the photo is optional now", () => {
  it("has a Foto section and an Audio section, both labelled", () => {
    setup()
    open()
    expect(screen.getByLabelText("Foto")).toBeTruthy()
    expect(group()).toBeTruthy()
  })

  it("asks for a photo or an audio, linked to the audio section, and uploads nothing", () => {
    const { prepare, upload } = setup()
    open()
    fill()
    submit()
    const error = screen.getByText(COPY.media)
    expect(COPY.media).toBe("Agrega una foto o un audio.")
    expect(group().getAttribute("aria-describedby")).toContain(error.id)
    expect(prepare).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
  })

  it("lets the visitor remove a photo they picked, and puts the photo box back as it was", () => {
    setup()
    open()
    const before = screen.getByTestId("photo-drop").className
    pickPhoto(photo({ name: "lluvia.jpg" }))
    expect(screen.getByText("lluvia.jpg")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Quitar foto" }))
    expect(screen.queryByText("lluvia.jpg")).toBeNull()
    expect(screen.queryByRole("img", { name: "Vista previa" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Quitar foto" })).toBeNull()
    expect(screen.getByTestId("photo-drop").className).toBe(before)
  })

  it("keeps the audio when the photo is removed, and goes on to ask for a photo or an audio only when both are gone", async () => {
    setup()
    open()
    pickPhoto(photo())
    pickAudio(audioFile())
    await heard()
    fireEvent.click(screen.getByRole("button", { name: "Quitar foto" }))
    expect(screen.getByRole("button", { name: "Escuchar" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Quitar audio" }))
    fill()
    submit()
    expect(screen.getByText(COPY.media)).toBeTruthy()
  })
})

describe("AddMemory: a picked audio file", () => {
  it("holds it, with its length, and offers to listen to it", async () => {
    const { readAudioDuration } = setup()
    readAudioDuration.mockResolvedValue(75_000)
    open()
    const file = audioFile({ name: "mi-voz.mp3" })
    pickAudio(file)
    await heard()
    expect(readAudioDuration).toHaveBeenCalledWith(file)
    expect(within(group()).getByText("mi-voz.mp3")).toBeTruthy()
    expect(group().textContent).toContain("1:15")
  })

  it("refuses the wrong type right away, linked to the section, and holds nothing", () => {
    setup()
    open()
    pickAudio(audioFile({ name: "a.png", type: "image/png" }))
    const error = screen.getByText(COPY.audioType)
    expect(group().getAttribute("aria-describedby")).toContain(error.id)
    expect(screen.queryByRole("button", { name: "Escuchar" })).toBeNull()
  })

  it("refuses an audio over the size cap right away", () => {
    setup()
    open()
    pickAudio(audioFile({ size: MAX_AUDIO_BYTES + 1 }))
    expect(screen.getByText(COPY.audioSize)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Escuchar" })).toBeNull()
  })

  it("refuses an audio longer than 60 minutes, once its length is read", async () => {
    const { readAudioDuration } = setup()
    readAudioDuration.mockResolvedValue(MAX_AUDIO_MS + 1000)
    open()
    pickAudio(audioFile())
    expect(await screen.findByText(COPY.audioLong)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Escuchar" })).toBeNull()
  })

  it("accepts an audio whose length the browser could not read: the server checks it", async () => {
    const { readAudioDuration } = setup()
    readAudioDuration.mockResolvedValue(null)
    open()
    pickAudio(audioFile())
    expect(await heard()).toBeTruthy()
    expect(screen.queryByText(COPY.audioLong)).toBeNull()
  })

  it("clears the error once a good audio replaces a bad one", async () => {
    setup()
    open()
    pickAudio(audioFile({ name: "a.png", type: "image/png" }))
    pickAudio(audioFile())
    await heard()
    expect(screen.queryByText(COPY.audioType)).toBeNull()
  })

  it("removes it on request, back to the Grabar and Subir audio choices", async () => {
    setup({ recorderEnv: micEnv() })
    open()
    pickAudio(audioFile())
    await heard()
    fireEvent.click(screen.getByRole("button", { name: "Quitar audio" }))
    expect(screen.getByRole("button", { name: "Grabar" })).toBeTruthy()
    expect(screen.getByLabelText("Subir audio")).toBeTruthy()
  })
})

describe("AddMemory: recording", () => {
  it("records with the microphone, shows the time, stops, and holds the take", async () => {
    setup({ recorderEnv: micEnv() })
    open()
    fireEvent.click(screen.getByRole("button", { name: "Grabar" }))
    expect((await screen.findByRole("timer")).textContent).toContain("0:00")
    expect(screen.getByTestId("talking-orb").getAttribute("data-active")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Detener" }))
    await heard()
    expect(screen.getByRole("button", { name: "Grabar de nuevo" })).toBeTruthy()
    for (const t of tracks) expect(t.stop).toHaveBeenCalled()
  })

  it("records again, which starts over", async () => {
    const env = micEnv()
    setup({ recorderEnv: env })
    open()
    await record()
    fireEvent.click(screen.getByRole("button", { name: "Grabar de nuevo" }))
    await screen.findByRole("timer")
    expect(env.getUserMedia).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("button", { name: "Escuchar" })).toBeNull()
  })

  it("explains a refused microphone and still lets the visitor upload a file", async () => {
    setup({
      recorderEnv: micEnv({
        getUserMedia: vi.fn(async () => {
          throw Object.assign(new Error("denied"), { name: "NotAllowedError" })
        }),
      }),
    })
    open()
    fireEvent.click(screen.getByRole("button", { name: "Grabar" }))
    expect((await screen.findByRole("alert")).textContent).toBe(RECORDER_COPY.errors.denied)
    expect(screen.getByLabelText("Subir audio")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Grabar" })).toBeTruthy()
  })

  it("offers only the upload, with a short message, where the browser cannot record", () => {
    setup({ recorderEnv: { now: () => 0 } })
    open()
    expect(screen.queryByRole("button", { name: "Grabar" })).toBeNull()
    expect(screen.getByLabelText("Subir audio")).toBeTruthy()
    expect(screen.getByText(RECORDER_COPY.errors.unsupported)).toBeTruthy()
  })

  it("does not save while a recording is still going, and says why", async () => {
    const { prepare } = setup({ recorderEnv: micEnv() })
    open()
    fill()
    fireEvent.click(screen.getByRole("button", { name: "Grabar" }))
    await screen.findByRole("timer")
    submit()
    expect(screen.getByText(COPY.audioRecording)).toBeTruthy()
    expect(prepare).not.toHaveBeenCalled()
  })

  it("lets the microphone go when the dialog closes in the middle of a recording", async () => {
    setup({ recorderEnv: micEnv() })
    open()
    fireEvent.click(screen.getByRole("button", { name: "Grabar" }))
    await screen.findByRole("timer")
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    for (const t of tracks) expect(t.stop).toHaveBeenCalled()
  })
})

describe("AddMemory: saving with audio", () => {
  it("saves an audio-only memory: asks for the audio only, sends it to the video endpoint and creates the memory", async () => {
    const { prepare, upload, create, onCreated } = setup()
    open()
    const file = audioFile()
    pickAudio(file)
    fill()
    await heard()
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(prepare).toHaveBeenCalledWith({ photo: false, audio: true })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload.mock.calls[0][0]).toMatchObject({
      file,
      cloudName: "demo",
      fields: { signature: "sa", public_id: "audio" },
      resource: "video",
    })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ ticket: "ticket-1", caption: "Mi voz", happenedOn: "2024-03-12" }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(MEMORY))
  })

  it("saves a photo with an audio: asks for both, uploads the photo to image and the audio to video", async () => {
    const { prepare, upload, create } = setup()
    open()
    pickPhoto(photo())
    pickAudio(audioFile())
    fill()
    await heard()
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(prepare).toHaveBeenCalledWith({ photo: true, audio: true })
    expect(upload.mock.calls.map(([options]) => options.resource)).toEqual(["image", "video"])
    expect(upload.mock.calls[0][0].fields).toMatchObject({ public_id: "photo" })
    expect(upload.mock.calls[1][0].fields).toMatchObject({ public_id: "audio" })
  })

  it("sends a recording under a name with the extension of its container", async () => {
    const { upload, create } = setup({ recorderEnv: micEnv() })
    open()
    fill()
    await record()
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(upload.mock.calls[0][0]).toMatchObject({ name: "recuerdo.webm", resource: "video" })
    expect(upload.mock.calls[0][0].file).toBeInstanceOf(Blob)
  })

  it("makes the progress cover both files, weighted by their size", async () => {
    let finishAudio!: (result: UploadResult) => void
    const upload = vi.fn<AddMemoryProps["upload"]>(({ resource, onProgress }) => {
      if (resource === "image") {
        onProgress(100)
        return Promise.resolve({ ok: true })
      }
      onProgress(50)
      return new Promise<UploadResult>((resolve) => (finishAudio = resolve))
    })
    setup({ upload, create: () => new Promise<CreateMemoryResult>(() => undefined) })
    open()
    pickPhoto(photo({ size: 3000 }))
    pickAudio(audioFile({ size: 1000 }))
    fill()
    await heard()
    submit()
    // The photo is done (3000 of 4000 bytes) and the audio is halfway (500 of 1000): 3500 of 4000.
    expect(await screen.findByRole("button", { name: "Subiendo… 88%" })).toBeTruthy()
    await act(async () => finishAudio({ ok: true }))
    expect(await screen.findByRole("button", { name: "Guardando…" })).toBeTruthy()
  })

  it("stops, without creating anything, when the audio upload fails", async () => {
    const { create } = setup({
      upload: async ({ resource }) => (resource === "video" ? { ok: false, reason: "failed" } : { ok: true }),
    })
    open()
    pickPhoto(photo())
    pickAudio(audioFile())
    fill()
    await heard()
    submit()
    expect((await screen.findByRole("alert")).textContent).toBe(COPY.unavailable)
    expect(create).not.toHaveBeenCalled()
  })

  it("shows the server's verdict on the audio next to the audio", async () => {
    setup({ create: async () => ({ ok: false, reason: "audio_too_long" }) })
    open()
    pickAudio(audioFile())
    fill()
    await heard()
    submit()
    const error = await screen.findByText(COPY.audioLong)
    expect(group().contains(error)).toBe(true)
  })

  it("tracks memory_audio_recorded, with no props, for a recording but not for an uploaded file", async () => {
    setup({ recorderEnv: micEnv() })
    open()
    fill()
    await record()
    submit()
    await waitFor(() => expect(track).toHaveBeenCalledWith("memory_audio_recorded"))
    expect(track.mock.calls.filter(([name]) => name === "memory_audio_recorded")).toHaveLength(1)
    expect(track.mock.calls.find(([name]) => name === "memory_audio_recorded")).toHaveLength(1)

    cleanup()
    track.mockReset()
    setup()
    open()
    pickAudio(audioFile())
    fill()
    await heard()
    submit()
    await waitFor(() => expect(track).toHaveBeenCalledWith("memory_submitted"))
    expect(track).not.toHaveBeenCalledWith("memory_audio_recorded")
  })

  it("locks the audio controls while saving", async () => {
    setup({ upload: () => new Promise<UploadResult>(() => undefined) })
    open()
    pickAudio(audioFile())
    fill()
    await heard()
    submit()
    await screen.findByRole("button", { name: /Subiendo/ })
    for (const name of ["Escuchar", "Grabar de nuevo", "Quitar audio"]) {
      const button = screen.queryByRole("button", { name }) as HTMLButtonElement | null
      if (button) expect(button.disabled).toBe(true)
    }
    expect((screen.getByRole("button", { name: "Escuchar" }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("AddMemory: the orb color with and without a photo", () => {
  it("offers the portal swatches, lifted to glow, for an audio-only memory, with the first chosen", async () => {
    setup()
    open()
    pickAudio(audioFile())
    await heard()
    expect(swatches().map((r) => r.getAttribute("data-color"))).toEqual(fallbackPalette())
    expect(swatches()[0].getAttribute("aria-checked")).toBe("true")
    expect(screen.getByText(ORB_COLOR_COPY.voice)).toBeTruthy()
  })

  it("sends the swatch the visitor chose for an audio-only memory", async () => {
    const { create } = setup()
    open()
    pickAudio(audioFile())
    fill()
    await heard()
    fireEvent.click(swatches()[2])
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ orbColor: fallbackPalette()[2] }))
  })

  it("takes the swatches from the photo when there is one, with or without an audio", async () => {
    setup()
    open()
    pickAudio(audioFile())
    pickPhoto(photo())
    await heard()
    await waitFor(() => expect(swatches().map((r) => r.getAttribute("data-color"))).toEqual(SWATCHES))
    expect(screen.getByText(ORB_COLOR_COPY.fromPhoto)).toBeTruthy()
  })

  it("falls back to the portal swatches when the photo is removed but the audio stays", async () => {
    setup()
    open()
    pickPhoto(photo())
    pickAudio(audioFile())
    await heard()
    await waitFor(() => expect(swatches().map((r) => r.getAttribute("data-color"))).toEqual(SWATCHES))
    fireEvent.click(screen.getByRole("button", { name: "Quitar foto" }))
    expect(swatches().map((r) => r.getAttribute("data-color"))).toEqual(fallbackPalette())
  })

  it("drops the swatches when the audio goes and there is no photo", async () => {
    setup()
    open()
    pickAudio(audioFile())
    await heard()
    fireEvent.click(screen.getByRole("button", { name: "Quitar audio" }))
    expect(screen.queryByRole("radiogroup")).toBeNull()
    expect(screen.getByText(ORB_COLOR_COPY.idle)).toBeTruthy()
  })

  it("previews the memory with a talking orb in the chosen color, which follows the swatches", async () => {
    setup()
    open()
    pickAudio(audioFile())
    await heard()
    const orb = () => screen.getByTestId("talking-orb")
    expect(orb().style.getPropertyValue("--pc")).toBe(fallbackPalette()[0])
    fireEvent.click(swatches()[1])
    expect(orb().style.getPropertyValue("--pc")).toBe(fallbackPalette()[1])
  })
})

describe("AddMemory: layout of the audio section", () => {
  it("sits in the left column, between the photo and the orb color, inside the one scroll region", async () => {
    setup()
    open()
    const columns = screen.getByTestId("memory-columns")
    const [left] = Array.from(columns.children) as HTMLElement[]
    const audio = group()
    expect(left.contains(audio)).toBe(true)
    expect(screen.getByTestId("memory-scroll").contains(audio)).toBe(true)
    const photoInput = screen.getByLabelText("Foto")
    const picker = screen.getByText(ORB_COLOR_COPY.label)
    expect(photoInput.compareDocumentPosition(audio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(audio.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("keeps the audio box the same height before and after an audio is held, so nothing jumps", async () => {
    setup()
    open()
    const box = () => screen.getByTestId("audio-box")
    const before = box().className
    pickAudio(audioFile())
    await heard()
    expect(box().className).toBe(before)
    expect(before).toMatch(/(^|\s)min-h-/)
  })

  it("has no section that scrolls by itself", () => {
    setup()
    open()
    const scrollers = Array.from(screen.getByRole("dialog").querySelectorAll<HTMLElement>("*")).filter((el) =>
      /(^|\s)(overflow-y-auto|overflow-y-scroll|overflow-auto|overflow-scroll)(\s|$)/.test(el.className?.toString() ?? ""),
    )
    expect(scrollers).toEqual([screen.getByTestId("memory-scroll")])
  })
})
