import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import { MAX_AUDIO_BYTES, MAX_AUDIO_MS } from "../upload-limits"
import type { CreateMemoryResult, PrepareUploadResult } from "../upload-view"
import type { ResolveMapsLinkResult } from "../place/resolve-maps-link"
import type { SuggestPlaceResult } from "../place/suggest-place"
import { ORB_HUES } from "../orb-hues"
import { AddMemory, type AddMemoryProps } from "./add-memory"
import { RECORDER_COPY } from "./audio-recorder-model"
import { AUDIO_COPY } from "./audio-section"
import type { UploadResult } from "./cloudinary-upload"
import { COPY } from "./memory-form-model"
import { ORB_COLOR_COPY } from "./orb-color-picker"
import type { PhotoPalette } from "./photo-palette"
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
/** The photo's own tones, none of them like a curated hue. */
const SWATCHES = ["#ce8b9f", "#b69f62", "#60b3a3", "#b692c6"]

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
          parsePhotoTime={async () => undefined}
          suggest={async (): Promise<SuggestPlaceResult> => ({ ok: true, label: "Palermo", address: null })}
          resolveLink={async (): Promise<ResolveMapsLinkResult> => ({ ok: true, lat: -34.58, lng: -58.42, label: "Plaza Italia", address: null })}
          readPalette={readPalette}
          readAudioDuration={readAudioDuration}
          levelEnv={{ createContext: () => null }}
          linkDebounceMs={0}
          onCreated={onCreated}
          today="2026-10-01"
          clock={() => NOW}
          doneDelayMs={20}
          {...over}
        />
      </div>
    )
  }
  render(<Stage />)
  return { prepare, upload, create, onCreated, readAudioDuration, readPalette }
}

/** The visitor's own clock: 1 October 2026 at 18:30, the same day as `today`. */
const NOW = new Date(2026, 9, 1, 18, 30, 0)
/** When the audio files of these tests were last changed, unless a test says otherwise. */
const FILE_TIME = new Date(2025, 11, 24, 21, 3, 0).getTime()

const open = () => fireEvent.click(screen.getByRole("button", { name: "Contribuir" }))
const photo = (over: Partial<{ name: string; type: string; size: number }> = {}) => {
  const { name = "foto.jpg", type = "image/jpeg", size = 2000 } = over
  const file = new File(["x"], name, { type })
  Object.defineProperty(file, "size", { value: size })
  return file
}
const audioFile = (over: Partial<{ name: string; type: string; size: number; lastModified: number }> = {}) => {
  const { name = "nota.mp3", type = "audio/mpeg", size = 4000, lastModified = FILE_TIME } = over
  const file = new File(["x"], name, { type, lastModified })
  Object.defineProperty(file, "size", { value: size })
  return file
}
const step = () => Number(screen.getByTestId("memory-form").getAttribute("data-step"))
const next = () => fireEvent.click(screen.getByRole("button", { name: "Siguiente" }))
/** Walks to a step with Siguiente and Atrás, the way the visitor does: Siguiente only moves on from a complete step. */
function goTo(target: number) {
  for (let moves = 0; step() !== target; moves++) {
    if (moves > 3) throw new Error(`Stuck on step ${step()} on the way to step ${target}`)
    fireEvent.click(screen.getByRole("button", { name: step() < target ? "Siguiente" : "Atrás" }))
  }
}
const photoInput = () => screen.getByLabelText(/^(Elegir|Cambiar) foto$/) as HTMLInputElement
const pickPhoto = (file: File) => {
  goTo(1)
  fireEvent.change(photoInput(), { target: { files: [file] } })
}
const pickAudio = (file: File) => {
  goTo(1)
  fireEvent.change(screen.getByLabelText("Subir audio"), { target: { files: [file] } })
}
/** The words and the date, on the second step: the visitor gets there once there is a photo or a voice. */
const fill = (caption = "Mi voz", date = "2024-03-12") => {
  goTo(2)
  fireEvent.change(screen.getByLabelText("¿Qué recuerdas?"), { target: { value: caption } })
  fireEvent.change(screen.getByLabelText("¿Cuándo fue?"), { target: { value: date } })
}
/** On to the color, the last step. */
const toColor = () => {
  fill()
  goTo(3)
}
const submit = () => {
  goTo(3)
  fireEvent.click(screen.getByRole("button", { name: /Guardar recuerdo|Subiendo|Guardando/ }))
}
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
  it("has a photo and a voice on the first step, both labelled", () => {
    setup()
    open()
    expect(photoInput().type).toBe("file")
    expect(group()).toBeTruthy()
    expect(group().closest("[data-step-panel]")?.getAttribute("data-step-panel")).toBe("1")
  })

  it("asks for a photo or the voice before going on, linked to the voice too, and uploads nothing", () => {
    const { prepare, upload } = setup()
    open()
    next()
    const error = screen.getByText(COPY.media)
    expect(COPY.media).toBe("Agrega una foto o tu voz para seguir.")
    expect(group().getAttribute("aria-describedby")).toContain(error.id)
    expect(step()).toBe(1)
    expect(prepare).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
  })

  it("lets the visitor remove a photo they picked, and puts the photo box back as it was", () => {
    setup()
    open()
    const before = screen.getByTestId("photo-drop").className
    pickPhoto(photo({ name: "lluvia.jpg" }))
    expect(screen.getByRole("img", { name: "Vista previa" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Quitar foto" }))
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
    next()
    expect(step()).toBe(2)
    goTo(1)
    fireEvent.click(screen.getByRole("button", { name: "Quitar audio" }))
    next()
    expect(screen.getByText(COPY.media)).toBeTruthy()
    expect(step()).toBe(1)
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

  it("does not go on while a recording is still going, says why, and focuses Detener", async () => {
    const { prepare } = setup({ recorderEnv: micEnv() })
    open()
    fireEvent.click(screen.getByRole("button", { name: "Grabar" }))
    await screen.findByRole("timer")
    next()
    expect(screen.getByText(COPY.audioRecording)).toBeTruthy()
    expect(step()).toBe(1)
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Detener" }))
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
    await heard()
    fill()
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
    await heard()
    fill()
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
    await record()
    fill()
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
    await heard()
    fill()
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
    await heard()
    fill()
    submit()
    expect((await screen.findByRole("alert")).textContent).toBe(COPY.unavailable)
    expect(create).not.toHaveBeenCalled()
  })

  it("shows the server's verdict on the audio next to the audio, back on the first step", async () => {
    setup({ create: async () => ({ ok: false, reason: "audio_too_long" }) })
    open()
    pickAudio(audioFile())
    await heard()
    fill()
    submit()
    const error = await screen.findByText(COPY.audioLong)
    await waitFor(() => expect(step()).toBe(1))
    expect(group().contains(error)).toBe(true)
  })

  it("tracks memory_audio_recorded, with no props, for a recording but not for an uploaded file", async () => {
    setup({ recorderEnv: micEnv() })
    open()
    await record()
    fill()
    submit()
    await waitFor(() => expect(track).toHaveBeenCalledWith("memory_audio_recorded"))
    expect(track.mock.calls.filter(([name]) => name === "memory_audio_recorded")).toHaveLength(1)
    expect(track.mock.calls.find(([name]) => name === "memory_audio_recorded")).toHaveLength(1)

    cleanup()
    track.mockReset()
    setup()
    open()
    pickAudio(audioFile())
    await heard()
    fill()
    submit()
    await waitFor(() => expect(track).toHaveBeenCalledWith("memory_submitted"))
    expect(track).not.toHaveBeenCalledWith("memory_audio_recorded")
  })

  it("locks the audio controls while saving", async () => {
    setup({ upload: () => new Promise<UploadResult>(() => undefined) })
    open()
    pickAudio(audioFile())
    await heard()
    fill()
    submit()
    await screen.findByRole("button", { name: /Subiendo/ })
    // The voice is on the first step, out of sight while the last one saves: its controls are locked all the same.
    for (const name of ["Escuchar", "Grabar de nuevo", "Quitar audio"]) {
      const button = screen.queryByRole("button", { name, hidden: true }) as HTMLButtonElement | null
      if (button) expect(button.disabled).toBe(true)
    }
    expect((screen.getByRole("button", { name: "Escuchar", hidden: true }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("AddMemory: the orb color with and without a photo", () => {
  const checked = () => swatches().find((r) => r.getAttribute("aria-checked") === "true")?.getAttribute("data-color")

  it("offers the twelve curated hues for an audio-only memory, with one drawn at random chosen", async () => {
    setup({ random: () => 0.25 })
    open()
    pickAudio(audioFile())
    await heard()
    toColor()
    expect(swatches().map((r) => r.getAttribute("data-color"))).toEqual(ORB_HUES)
    expect(checked()).toBe(ORB_HUES[3])
    expect(screen.getByText(ORB_COLOR_COPY.voice)).toBeTruthy()
  })

  it("draws the hue once per open, so it holds while the visitor works on the memory", async () => {
    const random = vi.fn(() => 0.9)
    setup({ random })
    open()
    pickAudio(audioFile())
    await heard()
    fireEvent.click(screen.getByRole("button", { name: "Quitar audio" }))
    pickAudio(audioFile({ name: "otra.mp3" }))
    await heard()
    toColor()
    expect(checked()).toBe(ORB_HUES[10])
    expect(random).toHaveBeenCalledTimes(1)
  })

  it("lets contributions vary: another draw proposes another hue", async () => {
    const { create } = setup({ random: () => 0 })
    open()
    pickAudio(audioFile())
    await heard()
    toColor()
    expect(checked()).toBe(ORB_HUES[0])
    submit()
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ orbColor: ORB_HUES[0] })))
    cleanup()

    const again = setup({ random: () => 0.99 })
    open()
    pickAudio(audioFile())
    await heard()
    toColor()
    expect(checked()).toBe(ORB_HUES[11])
    submit()
    await waitFor(() => expect(again.create).toHaveBeenCalledWith(expect.objectContaining({ orbColor: ORB_HUES[11] })))
  })

  it("sends the swatch the visitor chose for an audio-only memory, over the drawn one", async () => {
    const { create } = setup({ random: () => 0.5 })
    open()
    pickAudio(audioFile())
    await heard()
    toColor()
    fireEvent.click(swatches()[2])
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ orbColor: ORB_HUES[2] }))
  })

  it("takes the first swatches from the photo when there is one, with or without an audio", async () => {
    setup()
    open()
    pickAudio(audioFile())
    pickPhoto(photo())
    await heard()
    toColor()
    await waitFor(() => expect(swatches().map((r) => r.getAttribute("data-color"))).toEqual([...SWATCHES, ...ORB_HUES]))
    expect(checked()).toBe(SWATCHES[0])
    expect(screen.getByText(ORB_COLOR_COPY.fromPhoto)).toBeTruthy()
  })

  it("falls back to the curated hues when the photo is removed but the audio stays", async () => {
    setup({ random: () => 0.5 })
    open()
    pickPhoto(photo())
    pickAudio(audioFile())
    await heard()
    toColor()
    await waitFor(() => expect(swatches().map((r) => r.getAttribute("data-color"))).toEqual([...SWATCHES, ...ORB_HUES]))
    goTo(1)
    fireEvent.click(screen.getByRole("button", { name: "Quitar foto" }))
    goTo(3)
    expect(swatches().map((r) => r.getAttribute("data-color"))).toEqual(ORB_HUES)
    expect(checked()).toBe(ORB_HUES[6])
  })

  it("drops the swatches when the audio goes and there is no photo", async () => {
    setup()
    open()
    pickAudio(audioFile())
    await heard()
    fireEvent.click(screen.getByRole("button", { name: "Quitar audio" }))
    expect(screen.getByTestId("orb-swatches").getAttribute("role")).toBeNull()
    expect(screen.getByText(ORB_COLOR_COPY.idle)).toBeTruthy()
  })

  it("previews the memory with a talking orb in the chosen color, which follows the swatches", async () => {
    setup({ random: () => 0 })
    open()
    pickAudio(audioFile())
    await heard()
    const orb = () => screen.getByTestId("talking-orb")
    expect(orb().style.getPropertyValue("--pc")).toBe(ORB_HUES[0])
    toColor()
    fireEvent.click(swatches()[1])
    expect(orb().style.getPropertyValue("--pc")).toBe(ORB_HUES[1])
  })
})

describe("AddMemory: layout of the audio section", () => {
  it("sits on the first step, after the photo, inside the one scroll region", async () => {
    setup()
    open()
    const audio = group()
    expect(audio.closest("[data-step-panel]")?.getAttribute("data-step-panel")).toBe("1")
    expect(screen.getByTestId("memory-scroll").contains(audio)).toBe(true)
    expect(photoInput().compareDocumentPosition(audio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("keeps the audio box the same height before and after an audio is held, so nothing jumps", async () => {
    setup()
    open()
    const box = () => screen.getByTestId("audio-box")
    const before = box().className
    pickAudio(audioFile())
    await heard()
    expect(box().className).toBe(before)
    // 44 px controls and the panel padding above and below them.
    expect(before).toContain("h-[calc(2.75rem+2*var(--panel-pad))]")
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

describe("AddMemory: the date and time from the audio", () => {
  const dateField = () => screen.getByLabelText("¿Cuándo fue?") as HTMLInputElement
  const timeField = () => screen.getByLabelText("Hora") as HTMLInputElement

  it("fills the date and the time with the moment the recording started, on the visitor's clock", async () => {
    setup({ recorderEnv: micEnv() })
    open()
    await record()
    expect(dateField().value).toBe("2026-10-01")
    expect(timeField().value).toBe("18:30")
    expect(screen.getByText("Cuando empezaste a grabar")).toBeTruthy()
  })

  it("fills them from an uploaded audio file's date, marked as only approximate", async () => {
    setup()
    open()
    pickAudio(audioFile())
    await heard()
    expect(dateField().value).toBe("2025-12-24")
    expect(timeField().value).toBe("21:03")
    const hint = screen.getByText("Según el archivo de audio")
    expect(hint.getAttribute("data-approximate")).toBe("true")
  })

  it("clears what the audio filled in when the audio is removed", async () => {
    setup()
    open()
    pickAudio(audioFile())
    await heard()
    fireEvent.click(within(group()).getByRole("button", { name: "Quitar audio" }))
    expect(dateField().value).toBe("")
    expect(timeField().value).toBe("")
    expect(screen.queryByText("Según el archivo de audio")).toBeNull()
  })

  it("ignores a file dated later than now, or with no date at all", async () => {
    setup()
    open()
    pickAudio(audioFile({ lastModified: new Date(2026, 9, 1, 18, 31).getTime() }))
    await heard()
    expect(dateField().value).toBe("")
    fireEvent.click(within(group()).getByRole("button", { name: "Quitar audio" }))
    pickAudio(audioFile({ name: "otra.mp3", lastModified: 0 }))
    await heard()
    expect(dateField().value).toBe("")
    expect(screen.queryByText("Según el archivo de audio")).toBeNull()
  })

  it("lets the photo's own date win over the audio's", async () => {
    const parsePhotoTime = vi.fn(async () => ({ DateTimeOriginal: "2024:03:14 18:42:07" }))
    setup({ parsePhotoTime })
    open()
    pickAudio(audioFile())
    await heard()
    pickPhoto(photo())
    await waitFor(() => expect(dateField().value).toBe("2024-03-14"))
    expect(timeField().value).toBe("18:42")
    expect(screen.getByText("Desde tu foto")).toBeTruthy()
  })

  it("sends the audio's time with the date", async () => {
    const { create } = setup()
    open()
    pickAudio(audioFile())
    await heard()
    fireEvent.change(screen.getByLabelText("¿Qué recuerdas?"), { target: { value: "Mi voz" } })
    submit()
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0][0]).toMatchObject({ happenedOn: "2025-12-24", happenedTime: "21:03" })
  })
})
