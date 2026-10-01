import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MAX_AUDIO_MS } from "../upload-limits"
import { INITIAL_RECORDER, RECORDER_COPY, type RecorderState } from "./audio-recorder-model"
import { AUDIO_COPY, AudioSection, type AudioSectionProps } from "./audio-section"
import type { LevelEnv } from "./use-audio-level"

beforeEach(() => {
  vi.stubGlobal("matchMedia", undefined)
  vi.stubGlobal("requestAnimationFrame", () => 1)
  vi.stubGlobal("cancelAnimationFrame", () => {})
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const clip = { blob: new Blob(["x"], { type: "audio/webm" }), name: "recuerdo.webm", url: "blob:clip" }
const noAudioGraph: LevelEnv = { createContext: () => null }

function setup(state: Partial<RecorderState> = {}, over: Partial<AudioSectionProps> = {}, withClip = true) {
  const recorder = {
    state: { ...INITIAL_RECORDER, ...state },
    supported: true,
    clip: state.phase === "recorded" || state.phase === "playing" ? (withClip ? clip : null) : null,
    stream: null,
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    discard: vi.fn(),
    load: vi.fn(),
    playback: { onPlay: vi.fn(), onPause: vi.fn(), onEnded: vi.fn() },
  }
  const onPickFile = vi.fn()
  const view = render(
    <AudioSection
      recorder={recorder as unknown as AudioSectionProps["recorder"]}
      color="#a58cff"
      disabled={false}
      levelEnv={noAudioGraph}
      onPickFile={onPickFile}
      {...over}
    />,
  )
  return { recorder, onPickFile, view }
}

const group = () => screen.getByRole("group", { name: AUDIO_COPY.label })

describe("AudioSection: idle", () => {
  it("is a labelled group with a Grabar button and a file picker, and says how long and how big", () => {
    setup()
    expect(group()).toBeTruthy()
    expect(screen.getByRole("button", { name: "Grabar" })).toBeTruthy()
    expect(screen.getByLabelText("Subir audio")).toBeTruthy()
    expect(screen.getByText(AUDIO_COPY.hint)).toBeTruthy()
    expect(AUDIO_COPY.hint).toMatch(/2 minutos/)
    expect(AUDIO_COPY.hint).toMatch(/15 MB/)
  })

  it("starts recording on Grabar", () => {
    const { recorder } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Grabar" }))
    expect(recorder.start).toHaveBeenCalledTimes(1)
  })

  it("hands a picked file to the form", () => {
    const { onPickFile } = setup()
    const file = new File(["x"], "nota.mp3", { type: "audio/mpeg" })
    fireEvent.change(screen.getByLabelText("Subir audio"), { target: { files: [file] } })
    expect(onPickFile).toHaveBeenCalledWith(file)
  })

  it("accepts audio files in the picker", () => {
    setup()
    const input = screen.getByLabelText("Subir audio") as HTMLInputElement
    expect(input.type).toBe("file")
    expect(input.accept).toContain("audio/")
  })

  it("offers only the upload where the browser cannot record, and says so", () => {
    const { recorder } = setup()
    cleanup()
    render(
      <AudioSection
        recorder={{ ...recorder, supported: false } as unknown as AudioSectionProps["recorder"]}
        color="#a58cff"
        disabled={false}
        levelEnv={noAudioGraph}
        onPickFile={() => {}}
      />,
    )
    expect(screen.queryByRole("button", { name: "Grabar" })).toBeNull()
    expect(screen.getByLabelText("Subir audio")).toBeTruthy()
    expect(screen.getByText(RECORDER_COPY.errors.unsupported)).toBeTruthy()
  })

  it.each(["denied", "no_device", "unsupported", "failed"] as const)("shows the %s message as an alert", (error) => {
    setup({ error })
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toBe(RECORDER_COPY.errors[error])
    // Still able to try again or upload.
    expect(screen.getByRole("button", { name: "Grabar" })).toBeTruthy()
    expect(screen.getByLabelText("Subir audio")).toBeTruthy()
  })

  it("shows the form's validation error for the audio as an alert", () => {
    setup({}, { error: "El audio supera los 15 MB." })
    expect(screen.getByRole("alert").textContent).toBe("El audio supera los 15 MB.")
  })

  it("locks everything while the memory is being saved", () => {
    setup({}, { disabled: true })
    expect((screen.getByRole("button", { name: "Grabar" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText("Subir audio") as HTMLInputElement).disabled).toBe(true)
  })
})

describe("AudioSection: asking for the microphone and recording", () => {
  it("waits quietly while the browser asks, with Grabar disabled", () => {
    setup({ phase: "requesting" })
    expect((screen.getByRole("button", { name: "Grabar" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole("status").textContent).toBe(AUDIO_COPY.requesting)
  })

  it("shows the time against the cap and a Detener button while recording", () => {
    const { recorder } = setup({ phase: "recording", elapsedMs: 7_400 })
    const timer = screen.getByRole("timer")
    expect(timer.textContent).toContain("0:07")
    expect(timer.textContent).toContain("2:00")
    expect(MAX_AUDIO_MS).toBe(120_000)
    expect(screen.queryByRole("button", { name: "Grabar" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Detener" }))
    expect(recorder.stop).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("status").textContent).toBe(AUDIO_COPY.recording)
  })

  it("shows a talking orb that listens to the microphone", () => {
    setup({ phase: "recording", elapsedMs: 1000 })
    const orb = screen.getByTestId("talking-orb")
    expect(orb.getAttribute("data-active")).toBe("true")
    expect(orb.style.getPropertyValue("--pc")).toBe("#a58cff")
  })

  it("lets the visitor throw a take away while recording", () => {
    const { recorder } = setup({ phase: "recording", elapsedMs: 1000 })
    fireEvent.click(screen.getByRole("button", { name: "Quitar audio" }))
    expect(recorder.discard).toHaveBeenCalledTimes(1)
  })
})

describe("AudioSection: a recorded or picked audio", () => {
  const recorded = { phase: "recorded" as const, durationMs: 12_000, source: "recording" as const }

  it("plays the clip from its object URL in a hidden audio element tied to the recorder state", () => {
    const { recorder, view } = setup(recorded)
    const audio = view.container.querySelector("audio") as HTMLAudioElement
    expect(audio.getAttribute("src")).toBe("blob:clip")
    expect(audio.controls).toBe(false)
    fireEvent.play(audio)
    fireEvent.pause(audio)
    fireEvent.ended(audio)
    expect(recorder.playback.onPlay).toHaveBeenCalled()
    expect(recorder.playback.onPause).toHaveBeenCalled()
    expect(recorder.playback.onEnded).toHaveBeenCalled()
  })

  it("shows how long it is, the preview orb in the chosen color, and Escuchar, Grabar de nuevo and Quitar", () => {
    setup(recorded)
    expect(group().textContent).toContain("0:12")
    expect(screen.getByTestId("talking-orb").style.getPropertyValue("--pc")).toBe("#a58cff")
    expect(screen.getByRole("button", { name: "Escuchar" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Grabar de nuevo" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Quitar audio" })).toBeTruthy()
  })

  it("hides the length when the browser could not read it", () => {
    setup({ ...recorded, durationMs: null, source: "file" })
    expect(group().textContent).not.toMatch(/\d:\d\d/)
  })

  it("plays and pauses through the audio element", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve())
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
    setup(recorded)
    fireEvent.click(screen.getByRole("button", { name: "Escuchar" }))
    expect(play).toHaveBeenCalledTimes(1)
    expect(pause).not.toHaveBeenCalled()
  })

  it("says Pausar, and keeps the orb talking, while it plays; pausing goes through the element", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve())
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
    const { view } = setup({ ...recorded, phase: "playing" })
    expect(screen.getByTestId("talking-orb").getAttribute("data-active")).toBe("true")
    const button = screen.getByRole("button", { name: "Pausar" })
    // jsdom's element reports paused until it is told otherwise: make it look like it is playing.
    const audio = view.container.querySelector("audio") as HTMLAudioElement
    Object.defineProperty(audio, "paused", { value: false, configurable: true })
    fireEvent.click(button)
    expect(pause).toHaveBeenCalledTimes(1)
    expect(play).not.toHaveBeenCalled()
  })

  it("keeps the orb still while it is not playing", () => {
    setup(recorded)
    expect(screen.getByTestId("talking-orb").getAttribute("data-active")).toBe("false")
  })

  it("records again, and discards, on request", () => {
    const { recorder } = setup(recorded)
    fireEvent.click(screen.getByRole("button", { name: "Grabar de nuevo" }))
    expect(recorder.start).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: "Quitar audio" }))
    expect(recorder.discard).toHaveBeenCalledTimes(1)
  })

  it("does not offer to record again where the browser cannot", () => {
    const { recorder } = setup(recorded)
    cleanup()
    render(
      <AudioSection
        recorder={{ ...recorder, supported: false } as unknown as AudioSectionProps["recorder"]}
        color="#a58cff"
        disabled={false}
        levelEnv={noAudioGraph}
        onPickFile={() => {}}
      />,
    )
    expect(screen.queryByRole("button", { name: "Grabar de nuevo" })).toBeNull()
    expect(screen.getByRole("button", { name: "Quitar audio" })).toBeTruthy()
  })

  it("names the file that was picked", () => {
    setup({ ...recorded, source: "file" })
    // The clip's name is shown for an uploaded file, not for a recording.
    cleanup()
    const named = { ...clip, name: "mi-voz.mp3" }
    render(
      <AudioSection
        recorder={
          {
            state: { ...INITIAL_RECORDER, ...recorded, source: "file" },
            supported: true,
            clip: named,
            stream: null,
            start: vi.fn(),
            stop: vi.fn(),
            discard: vi.fn(),
            load: vi.fn(),
            playback: { onPlay: vi.fn(), onPause: vi.fn(), onEnded: vi.fn() },
          } as unknown as AudioSectionProps["recorder"]
        }
        color="#a58cff"
        disabled={false}
        levelEnv={noAudioGraph}
        onPickFile={() => {}}
      />,
    )
    expect(within(group()).getByText("mi-voz.mp3")).toBeTruthy()
  })

  it("locks the buttons while saving", () => {
    setup(recorded, { disabled: true })
    for (const name of ["Escuchar", "Grabar de nuevo", "Quitar audio"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it("never starts the audio by itself", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve())
    const { view } = setup(recorded)
    expect((view.container.querySelector("audio") as HTMLAudioElement).autoplay).toBe(false)
    act(() => {})
    expect(play).not.toHaveBeenCalled()
  })
})
