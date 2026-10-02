import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import type { ShareMemoryResult } from "../share/share-view"
import type { RecordViewResult } from "../views/view-result"
import { lensGeometry } from "./glass-layout"
import { GlassView } from "./glass-view"
import type { Lens } from "./lens"
import * as readiness from "./audio-readiness"
import { BAR_COUNT, BAR_REST } from "./audio-bars"
import { VOLUME_KEY, resetVolumeSession } from "./player-model"

// jsdom has no Web Audio: a voice that is loud while it plays stands in for the analyser (one stable handle per state, as
// the real hook gives).
const setVolume = vi.hoisted(() => vi.fn())
vi.mock("./use-audio-level", () => {
  const spectrum = new Uint8Array(1024).fill(200)
  const playing = { level: () => 0.6, spectrum: () => spectrum, setVolume }
  const idle = { level: () => 0, spectrum: () => null, setVolume }
  return {
    useAudioGraph: (_source: unknown, active: boolean) => (active ? playing : idle),
    useAudioLevel: (_source: unknown, active: boolean) => (active ? playing : idle).level,
  }
})

// The readiness of the audio route is its own tested hook; here it is steered, except in the one test that runs it.
vi.mock("./audio-readiness", async (original) => ({
  ...(await original<typeof import("./audio-readiness")>()),
  useAudioReadiness: vi.fn(),
}))
const readyAudio = () => ({ status: "ready" as const, retry: vi.fn() })

const view = (id: string, caption: string, over: Partial<MemoryView> = {}): MemoryView => ({
  id,
  caption,
  happenedOn: "2024-03-12",
  status: "approved",
  width: 800,
  height: 600,
  kind: "image",
  takenAt: null,
  dominantColor: null,
  place: null,
  orbColor: "#8ab4ff",
  viewCount: 0,
  thumbUrl: `https://res.cloudinary.com/demo/t/${id}`,
  fullUrl: `https://res.cloudinary.com/demo/f/${id}`,
  audio: null,
  ...over,
})

const voice = { url: "/api/memories/a/audio", durationMs: 65000 }
const photo = view("p", "Una tarde de lluvia")
const both = view("b", "La casa nueva", { audio: voice })
const audioOnly = view("a", "Mamá cantando", { width: null, height: null, thumbUrl: null, fullUrl: null, audio: voice })

interface Props {
  memory: MemoryView | null
  prev: MemoryView | null
  next: MemoryView | null
  reduced: boolean
  onStep: (id: string) => void
  onClose: () => void
  onRestoreFocus: (id: string) => void
  onWarm: (memory: MemoryView) => void
  lens: Lens | null
  travel: () => number | null
  switching: boolean
  share?: (id: string) => Promise<ShareMemoryResult>
  onView?: (id: string) => Promise<RecordViewResult>
}

const DESKTOP = { width: 1440, height: 900 }

function mount(over: Partial<Props> = {}, viewport: { width: number; height: number; dpr?: number } = DESKTOP) {
  const props: Props = {
    memory: photo,
    prev: null,
    next: null,
    reduced: false,
    onStep: vi.fn(),
    onClose: vi.fn(),
    onRestoreFocus: vi.fn(),
    onWarm: vi.fn(),
    lens: null,
    travel: () => null,
    switching: false,
    ...over,
  }
  const utils = render(<GlassView {...props} container={document.body} viewport={viewport} />)
  const again = (next: Partial<Props>) =>
    utils.rerender(<GlassView {...props} {...next} container={document.body} viewport={viewport} />)
  return { props, again, ...utils }
}

let frames: Array<(now: number) => void> = []
let play: ReturnType<typeof vi.spyOn>
let pause: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  frames = []
  setVolume.mockClear()
  resetVolumeSession()
  localStorage.clear()
  vi.mocked(readiness.useAudioReadiness).mockImplementation(readyAudio)
  vi.stubGlobal("matchMedia", undefined)
  vi.stubGlobal("AudioContext", undefined)
  vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => frames.push(cb))
  vi.stubGlobal("cancelAnimationFrame", () => {})
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("play"))
    return Promise.resolve()
  })
  pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event("pause"))
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function runFrames(count: number, ms = 16) {
  for (let i = 1; i <= count; i++) {
    const batch = frames
    frames = []
    // The voice smoothing reads the same clock the frames report.
    vi.spyOn(performance, "now").mockReturnValue(1000 + i * ms)
    act(() => batch.forEach((cb) => cb(1000 + i * ms)))
  }
}

const dialog = () => screen.getByRole("dialog")
const audioButton = () => within(dialog()).getByRole("button", { name: /audio/i })
const progress = () => within(dialog()).getByRole("slider", { name: "Progreso del audio" }) as HTMLInputElement
const volumeSlider = () => within(dialog()).getByRole("slider", { name: "Volumen" }) as HTMLInputElement
const muteButton = () => within(dialog()).getByRole("button", { name: "Silenciar" })

describe("GlassView as a dialog", () => {
  it("is closed when there is no memory", () => {
    mount({ memory: null })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("is a dialog named by the caption, with the date and place around the sphere", () => {
    const place = { lat: -34.59, lng: -58.42, name: "Palermo, Buenos Aires" }
    mount({ memory: view("p", "Una tarde de lluvia", { place }) })
    expect(screen.getByRole("dialog", { name: "Una tarde de lluvia" })).toBeTruthy()
    expect(within(dialog()).getByText("12 de marzo de 2024")).toBeTruthy()
    expect(within(dialog()).getByText("Palermo, Buenos Aires")).toBeTruthy()
    expect(dialog().textContent).not.toMatch(/34\.59|58\.42/)
  })

  it("sets the caption in Gambarino", () => {
    mount()
    expect(within(dialog()).getByText("Una tarde de lluvia").className).toContain("t-title")
  })

  it("moves focus into the dialog when it opens", () => {
    mount()
    expect(dialog().contains(document.activeElement)).toBe(true)
  })

  it("says a pending memory is waiting for approval", () => {
    mount({ memory: view("p", "Mío", { status: "pending" }) })
    expect(within(dialog()).getByText("Pendiente de aprobación")).toBeTruthy()
  })

  it("closes with Escape, the close button, and by zooming out on the sphere", () => {
    const { props } = mount()
    fireEvent.keyDown(dialog(), { key: "Escape" })
    expect(props.onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cerrar" }))
    expect(props.onClose).toHaveBeenCalledTimes(2)
    const sphere = dialog().querySelector("[data-glass-sphere]")!
    fireEvent.wheel(sphere, { deltaY: -120 })
    expect(props.onClose).toHaveBeenCalledTimes(2)
    fireEvent.wheel(sphere, { deltaY: 120 })
    expect(props.onClose).toHaveBeenCalledTimes(3)
  })

  it("asks for the focus to go back to the orb once it has closed", async () => {
    const { props, again } = mount()
    again({ memory: null })
    await waitFor(() => expect(props.onRestoreFocus).toHaveBeenCalledWith("p"))
  })
})

describe("GlassView photo", () => {
  it("holds the photo as an accessible image named by the caption", () => {
    mount()
    const img = within(dialog()).getByRole("img", { name: "Una tarde de lluvia" }) as HTMLImageElement
    expect(img.src).toBe("https://res.cloudinary.com/demo/f/p")
  })

  it("holds the photo at the size the glass shows it on this screen, the same square crop as the orb", () => {
    const sizes = [96, 192, 384, 768, 1600].map((width) => ({ width, url: `https://res.cloudinary.com/demo/sq/${width}/p` }))
    const ladder = view("p", "Una tarde de lluvia", { photo: { sizes } })
    const srcAt = (dpr: number) => {
      const { unmount } = mount({ memory: ladder }, { ...DESKTOP, dpr })
      const src = (within(dialog()).getByRole("img", { name: "Una tarde de lluvia" }) as HTMLImageElement).src
      unmount()
      return src
    }
    expect(srcAt(1)).toBe("https://res.cloudinary.com/demo/sq/768/p")
    expect(srcAt(2)).toBe("https://res.cloudinary.com/demo/sq/1600/p")
  })

  it("loads the photo with CORS so WebGL may read it", () => {
    mount()
    expect((within(dialog()).getByRole("img", { name: "Una tarde de lluvia" }) as HTMLImageElement).crossOrigin).toBe("anonymous")
  })

  it("has no audio control for a photo-only memory", () => {
    mount()
    expect(within(dialog()).queryByRole("button", { name: /audio/i })).toBeNull()
  })
})

describe("GlassView audio only", () => {
  it("is an empty glass: no photo, but still a described image and the voice control", () => {
    mount({ memory: audioOnly })
    expect(dialog().querySelector("img")).toBeNull()
    const sphere = within(dialog()).getByRole("img", { name: /Mamá cantando/ })
    expect(sphere.getAttribute("aria-label")).toMatch(/voz/i)
    expect(audioButton()).toBeTruthy()
  })

  it("shows how long the voice is", () => {
    mount({ memory: audioOnly })
    expect(within(dialog()).getByText("1:05")).toBeTruthy()
  })

  it("lights the inner glow from the orb color", () => {
    mount({ memory: view("a", "Voz", { ...audioOnly, orbColor: "#ff9a3c" }) })
    const sphere = dialog().querySelector("[data-glass-sphere]") as HTMLElement
    expect(sphere.style.getPropertyValue("--pc")).toBe("#ff9a3c")
  })
})

describe("GlassView audio button", () => {
  it("starts as a play button that is not pressed", () => {
    mount({ memory: both })
    expect(audioButton().getAttribute("aria-label")).toBe("Reproducir audio")
    expect(audioButton().getAttribute("aria-pressed")).toBe("false")
  })

  it("plays and pauses, and always says which state it is in", () => {
    mount({ memory: both })
    fireEvent.click(audioButton())
    expect(play).toHaveBeenCalledTimes(1)
    expect(audioButton().getAttribute("aria-label")).toBe("Pausar audio")
    expect(audioButton().getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(audioButton())
    expect(pause).toHaveBeenCalled()
    expect(audioButton().getAttribute("aria-label")).toBe("Reproducir audio")
    expect(audioButton().getAttribute("aria-pressed")).toBe("false")
  })

  it("shows how far it has played while it plays, and the full length at rest", () => {
    mount({ memory: both })
    expect(within(dialog()).getByText("1:05")).toBeTruthy()
    fireEvent.click(audioButton())
    const audio = dialog().querySelector("audio")!
    Object.defineProperty(audio, "currentTime", { configurable: true, value: 12.4 })
    act(() => {
      audio.dispatchEvent(new Event("timeupdate"))
    })
    expect(within(dialog()).getByText("0:12")).toBeTruthy()
    expect(within(dialog()).getByText("1:05")).toBeTruthy()
    expect(progress().getAttribute("aria-valuetext")).toBe("0:12 de 1:05")
    act(() => {
      audio.dispatchEvent(new Event("ended"))
    })
    expect(within(dialog()).getByText("0:00")).toBeTruthy()
    expect(within(dialog()).getByText("1:05")).toBeTruthy()
  })

  it("goes back to play when the audio ends", () => {
    mount({ memory: both })
    fireEvent.click(audioButton())
    const audio = dialog().querySelector("audio")!
    act(() => {
      audio.dispatchEvent(new Event("ended"))
    })
    expect(audioButton().getAttribute("aria-pressed")).toBe("false")
  })

  it("loads the voice with CORS, from our own audio route", () => {
    mount({ memory: both })
    const audio = dialog().querySelector("audio")!
    expect(audio.getAttribute("src")).toBe(voice.url)
    expect(audio.crossOrigin).toBe("anonymous")
  })

  it("says when the audio cannot be played, and stops offering it", () => {
    mount({ memory: both })
    const audio = dialog().querySelector("audio")!
    act(() => {
      audio.dispatchEvent(new Event("error"))
    })
    expect(audioButton().getAttribute("aria-label")).toBe("Audio no disponible")
    expect((audioButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it("stops playing when the view closes", () => {
    const { again } = mount({ memory: both })
    fireEvent.click(audioButton())
    pause.mockClear()
    again({ memory: null })
    expect(pause).toHaveBeenCalled()
  })

  it("stops playing when it moves to another memory", () => {
    const { again } = mount({ memory: both })
    fireEvent.click(audioButton())
    pause.mockClear()
    again({ memory: photo })
    expect(pause).toHaveBeenCalled()
  })

  it("stops playing when it is unmounted", () => {
    const { unmount } = mount({ memory: both })
    fireEvent.click(audioButton())
    pause.mockClear()
    unmount()
    expect(pause).toHaveBeenCalled()
  })
})

describe("GlassView audio that is still processing", () => {
  const asks = () => vi.mocked(readiness.useAudioReadiness)

  it("asks the readiness of the memory's own audio route, and of nothing for a photo", () => {
    mount({ memory: both })
    expect(asks()).toHaveBeenCalledWith(voice.url)
    asks().mockClear()
    mount({ memory: photo })
    expect(asks()).toHaveBeenCalledWith(null)
  })

  it("says it is processing, quietly, and offers no playing yet", () => {
    asks().mockImplementation(() => ({ status: "processing", retry: vi.fn() }))
    mount({ memory: both })
    const button = within(dialog()).getByRole("button", { name: "Procesando audio…" }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(within(dialog()).getByText("Procesando audio…", { selector: "[role=status]" })).toBeTruthy()
    expect(within(dialog()).queryByText("1:05")).toBeNull()
    // Nothing is fetched from the route by the player until it is ready (it would only answer 503).
    expect(dialog().querySelector("audio")).toBeNull()
  })

  it("does not flash the processing copy while it is only checking", () => {
    asks().mockImplementation(() => ({ status: "checking", retry: vi.fn() }))
    mount({ memory: both })
    expect(within(dialog()).queryByText("Procesando audio…")).toBeNull()
    expect((audioButton() as HTMLButtonElement).disabled).toBe(true)
    expect(within(dialog()).getByText("1:05")).toBeTruthy()
  })

  it("says when it gave up", () => {
    asks().mockImplementation(() => ({ status: "unavailable", retry: vi.fn() }))
    mount({ memory: both })
    expect(audioButton().getAttribute("aria-label")).toBe("Audio no disponible")
    expect((audioButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it("turns into the play control, with its length, once the audio is ready", () => {
    asks().mockImplementation(() => ({ status: "processing", retry: vi.fn() }))
    const { again } = mount({ memory: both })
    asks().mockImplementation(readyAudio)
    again({ memory: both })
    expect(audioButton().getAttribute("aria-label")).toBe("Reproducir audio")
    expect((audioButton() as HTMLButtonElement).disabled).toBe(false)
    expect(within(dialog()).getByText("1:05")).toBeTruthy()
    expect(dialog().querySelector("audio")!.getAttribute("src")).toBe(voice.url)
  })

  it("retries on its own against the route until it answers, then plays", async () => {
    vi.useFakeTimers()
    try {
      const actual = await vi.importActual<typeof import("./audio-readiness")>("./audio-readiness")
      asks().mockImplementation(actual.useAudioReadiness)
      const answers = [
        new Response(null, { status: 503, headers: { "X-Audio-State": "processing" } }),
        new Response(null, { status: 206 }),
      ]
      const fetchMock = vi.fn(() => Promise.resolve(answers.shift()!))
      vi.stubGlobal("fetch", fetchMock)
      mount({ memory: audioOnly })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(within(dialog()).getByRole("button", { name: "Procesando audio…" })).toBeTruthy()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(actual.RETRY_DELAYS_MS[0])
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      fireEvent.click(audioButton())
      expect(play).toHaveBeenCalledTimes(1)
      expect(audioButton().getAttribute("aria-label")).toBe("Pausar audio")
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps the analyser's source usable: a same-origin audio keeps crossOrigin and feeds the level", () => {
    mount({ memory: both })
    const audio = dialog().querySelector("audio")!
    expect(audio.crossOrigin).toBe("anonymous")
    expect(audio.getAttribute("src")).toMatch(/^\/api\/memories\//)
  })
})

describe("GlassView player", () => {
  const sphereBox = (viewport = DESKTOP) => lensGeometry(viewport, 1)

  it("puts the play button at the center of the sphere, not on its rim", () => {
    mount({ memory: both })
    const geometry = sphereBox()
    const holder = dialog().querySelector<HTMLElement>("[data-glass-voice]")!
    expect(holder.style.left).toBe(`${geometry.center.x}px`)
    expect(holder.style.top).toBe(`${geometry.center.y}px`)
    expect(holder.contains(audioButton())).toBe(true)
  })

  it("keeps the play button 64 px, a comfortable target", () => {
    mount({ memory: both })
    expect(audioButton().className).toContain("size-16")
  })

  it("lays a circular contrast scrim over the sphere, darker while paused than while playing", () => {
    mount({ memory: both })
    const geometry = sphereBox()
    const scrim = dialog().querySelector<HTMLElement>("[data-glass-scrim]")!
    expect(scrim.getAttribute("aria-hidden")).toBe("true")
    expect(scrim.className).toContain("mem-glass-scrim")
    // Exactly the sphere's disc: round, never a square box around it.
    expect(scrim.style.width).toBe(`${geometry.diameter}px`)
    expect(scrim.style.height).toBe(`${geometry.diameter}px`)
    expect(scrim.style.left).toBe(`${geometry.center.x}px`)
    expect(scrim.style.top).toBe(`${geometry.center.y}px`)
    expect(scrim.getAttribute("data-state")).toBe("idle")
    fireEvent.click(audioButton())
    expect(scrim.getAttribute("data-state")).toBe("playing")
  })

  it("lays no scrim and no player on a photo-only memory", () => {
    mount()
    expect(dialog().querySelector("[data-glass-scrim]")).toBeNull()
    expect(dialog().querySelector("[data-glass-bars]")).toBeNull()
    expect(within(dialog()).queryByRole("slider")).toBeNull()
  })

  describe("frequency bars", () => {
    const bars = () => Array.from(dialog().querySelectorAll<HTMLElement>("[data-glass-bar]"))
    const scale = (bar: HTMLElement) => Number(/scaleY\(([\d.]+)\)/.exec(bar.style.transform)?.[1])

    it("draws a row of bars that the screen reader skips", () => {
      mount({ memory: both })
      expect(bars()).toHaveLength(BAR_COUNT)
      expect(dialog().querySelector("[data-glass-bars]")!.getAttribute("aria-hidden")).toBe("true")
    })

    it("rests on a calm low baseline while paused", () => {
      mount({ memory: both })
      runFrames(5)
      expect(bars().every((bar) => scale(bar) === BAR_REST)).toBe(true)
    })

    it("moves with the spectrum while it plays, mirrored around the middle", () => {
      mount({ memory: both })
      fireEvent.click(audioButton())
      runFrames(12)
      const heights = bars().map(scale)
      expect(Math.max(...heights)).toBeGreaterThan(0.5)
      expect(heights.every((h) => h <= 1)).toBe(true)
      expect(heights[0]).toBeCloseTo(heights[BAR_COUNT - 1], 3)
    })

    it("eases back to the baseline once it is paused", () => {
      mount({ memory: both })
      fireEvent.click(audioButton())
      runFrames(12)
      fireEvent.click(audioButton())
      runFrames(160)
      expect(bars().every((bar) => scale(bar) === BAR_REST)).toBe(true)
    })

    it("stays still under reduced motion", () => {
      mount({ memory: both, reduced: true })
      fireEvent.click(audioButton())
      runFrames(12)
      expect(bars().every((bar) => scale(bar) === BAR_REST)).toBe(true)
    })
  })

  describe("progress", () => {
    it("is a slider for the whole voice, read as where it is of how long it is", () => {
      mount({ memory: both })
      const slider = progress()
      expect(slider.type).toBe("range")
      expect(slider.min).toBe("0")
      expect(slider.max).toBe("65")
      expect(slider.value).toBe("0")
      expect(slider.getAttribute("aria-valuetext")).toBe("0:00 de 1:05")
    })

    it("follows the voice as it plays", () => {
      mount({ memory: both })
      fireEvent.click(audioButton())
      const audio = dialog().querySelector("audio")!
      Object.defineProperty(audio, "currentTime", { configurable: true, writable: true, value: 30.2 })
      act(() => {
        audio.dispatchEvent(new Event("timeupdate"))
      })
      expect(progress().value).toBe("30")
      expect(progress().getAttribute("aria-valuetext")).toBe("0:30 de 1:05")
    })

    it("seeks at once with the keyboard", () => {
      mount({ memory: both })
      const audio = dialog().querySelector("audio")!
      Object.defineProperty(audio, "currentTime", { configurable: true, writable: true, value: 0 })
      fireEvent.change(progress(), { target: { value: "20" } })
      expect(audio.currentTime).toBe(20)
      expect(progress().value).toBe("20")
    })

    it("seeks when a drag is released, not on every move (a long voice would ask the server for a range each time)", () => {
      mount({ memory: both })
      const audio = dialog().querySelector("audio")!
      Object.defineProperty(audio, "currentTime", { configurable: true, writable: true, value: 5 })
      fireEvent.pointerDown(progress(), { pointerType: "mouse", clientX: 10, clientY: 10 })
      fireEvent.change(progress(), { target: { value: "30" } })
      fireEvent.change(progress(), { target: { value: "40" } })
      expect(audio.currentTime).toBe(5)
      expect(progress().value).toBe("40")
      expect(progress().getAttribute("aria-valuetext")).toBe("0:40 de 1:05")
      fireEvent.pointerUp(progress(), { pointerType: "mouse", clientX: 90, clientY: 10 })
      expect(audio.currentTime).toBe(40)
    })

    it("does not fight the drag while the voice keeps playing", () => {
      mount({ memory: both })
      fireEvent.click(audioButton())
      const audio = dialog().querySelector("audio")!
      Object.defineProperty(audio, "currentTime", { configurable: true, writable: true, value: 3 })
      fireEvent.pointerDown(progress(), { pointerType: "mouse", clientX: 10, clientY: 10 })
      fireEvent.change(progress(), { target: { value: "50" } })
      act(() => {
        audio.dispatchEvent(new Event("timeupdate"))
      })
      expect(progress().value).toBe("50")
    })

    it("is not a swipe: dragging the scrubber sideways does not turn the page", () => {
      const prev = view("x", "Antes")
      const next = view("y", "Después")
      const { props } = mount({ memory: both, prev, next })
      fireEvent.pointerDown(progress(), { pointerType: "touch", clientX: 300, clientY: 700 })
      fireEvent.pointerUp(progress(), { pointerType: "touch", clientX: 120, clientY: 704 })
      expect(props.onStep).not.toHaveBeenCalled()
    })

    it("cannot be used until the audio is ready", () => {
      vi.mocked(readiness.useAudioReadiness).mockImplementation(() => ({ status: "checking", retry: vi.fn() }))
      mount({ memory: both })
      expect(progress().disabled).toBe(true)
    })

    it("gives way to the processing message while the audio is still being made", () => {
      vi.mocked(readiness.useAudioReadiness).mockImplementation(() => ({ status: "processing", retry: vi.fn() }))
      mount({ memory: both })
      expect(within(dialog()).queryByRole("slider", { name: "Progreso del audio" })).toBeNull()
    })
  })

  describe("volume", () => {
    it("is a slider named Volumen, at full for a first visit", () => {
      mount({ memory: both })
      expect(volumeSlider().value).toBe("100")
      expect(volumeSlider().getAttribute("aria-valuetext")).toBe("100 %")
    })

    it("sets the volume of the voice through the audio graph", () => {
      mount({ memory: both })
      fireEvent.change(volumeSlider(), { target: { value: "40" } })
      expect(setVolume).toHaveBeenLastCalledWith(0.4)
      expect(volumeSlider().getAttribute("aria-valuetext")).toBe("40 %")
    })

    it("silences and restores with the mute button, which says whether it is pressed", () => {
      mount({ memory: both })
      fireEvent.change(volumeSlider(), { target: { value: "40" } })
      expect(muteButton().getAttribute("aria-pressed")).toBe("false")
      fireEvent.click(muteButton())
      expect(setVolume).toHaveBeenLastCalledWith(0)
      expect(muteButton().getAttribute("aria-pressed")).toBe("true")
      expect(volumeSlider().value).toBe("0")
      expect(volumeSlider().getAttribute("aria-valuetext")).toBe("Silenciado")
      fireEvent.click(muteButton())
      expect(setVolume).toHaveBeenLastCalledWith(0.4)
      expect(muteButton().getAttribute("aria-pressed")).toBe("false")
      expect(volumeSlider().value).toBe("40")
    })

    it("un-mutes when the slider is moved up", () => {
      mount({ memory: both })
      fireEvent.click(muteButton())
      fireEvent.change(volumeSlider(), { target: { value: "70" } })
      expect(muteButton().getAttribute("aria-pressed")).toBe("false")
      expect(setVolume).toHaveBeenLastCalledWith(0.7)
    })

    it("brings a slider dragged to zero back to a middle volume when unmuted", () => {
      mount({ memory: both })
      fireEvent.change(volumeSlider(), { target: { value: "0" } })
      expect(setVolume).toHaveBeenLastCalledWith(0)
      fireEvent.click(muteButton())
      expect(setVolume).toHaveBeenLastCalledWith(0.5)
    })

    it("is remembered from one memory to the next, and across visits", () => {
      const { again } = mount({ memory: both })
      fireEvent.change(volumeSlider(), { target: { value: "30" } })
      expect(JSON.parse(localStorage.getItem(VOLUME_KEY)!)).toEqual({ volume: 0.3, muted: false })
      again({ memory: audioOnly })
      expect(volumeSlider().value).toBe("30")
      expect(setVolume).toHaveBeenLastCalledWith(0.3)
    })

    it("starts from the volume of an earlier visit", () => {
      localStorage.setItem(VOLUME_KEY, JSON.stringify({ volume: 0.6, muted: false }))
      mount({ memory: both })
      expect(volumeSlider().value).toBe("60")
      expect(setVolume).toHaveBeenLastCalledWith(0.6)
    })
  })

  describe("keyboard", () => {
    it("plays and pauses with Space and K", () => {
      mount({ memory: both })
      fireEvent.keyDown(dialog(), { key: " " })
      expect(audioButton().getAttribute("aria-pressed")).toBe("true")
      fireEvent.keyDown(dialog(), { key: "k" })
      expect(audioButton().getAttribute("aria-pressed")).toBe("false")
      fireEvent.keyDown(dialog(), { key: "K" })
      expect(audioButton().getAttribute("aria-pressed")).toBe("true")
    })

    it("does not play from a slider, which owns its keys", () => {
      mount({ memory: both })
      fireEvent.keyDown(progress(), { key: " " })
      fireEvent.keyDown(volumeSlider(), { key: "k" })
      expect(play).not.toHaveBeenCalled()
    })

    it("leaves Space to a focused button, such as Cerrar", () => {
      mount({ memory: both })
      fireEvent.keyDown(within(dialog()).getByRole("button", { name: "Cerrar" }), { key: " " })
      expect(play).not.toHaveBeenCalled()
    })

    it("does nothing for a photo, or while the audio is not ready", () => {
      mount()
      fireEvent.keyDown(dialog(), { key: " " })
      expect(play).not.toHaveBeenCalled()
      cleanup()
      vi.mocked(readiness.useAudioReadiness).mockImplementation(() => ({ status: "processing", retry: vi.fn() }))
      mount({ memory: both })
      fireEvent.keyDown(dialog(), { key: " " })
      expect(play).not.toHaveBeenCalled()
    })

    it("keeps the arrows for the previous and next memory, except on a slider", () => {
      const prev = view("x", "Antes")
      const next = view("y", "Después")
      const { props } = mount({ memory: both, prev, next })
      fireEvent.keyDown(dialog(), { key: "ArrowRight" })
      expect(props.onStep).toHaveBeenCalledTimes(1)
      fireEvent.keyDown(progress(), { key: "ArrowRight" })
      fireEvent.keyDown(volumeSlider(), { key: "ArrowLeft" })
      expect(props.onStep).toHaveBeenCalledTimes(1)
    })

    it("lets go of the keys when the view closes", () => {
      const { again } = mount({ memory: both })
      again({ memory: null })
      play.mockClear()
      fireEvent.keyDown(document.body, { key: " " })
      expect(play).not.toHaveBeenCalled()
    })
  })

  describe("room on a phone", () => {
    const PHONE = { width: 360, height: 740 }
    const player = () => dialog().querySelector<HTMLElement>("[data-glass-player]")!
    const widthOf = (el: HTMLElement) => Number(/(?:^|\s)w-(\d+)(?:\s|$)/.exec(el.className)?.[1]) * 4

    it("gives the progress a full-width row of its own and the volume the next one", () => {
      mount({ memory: both }, PHONE)
      const rows = player().querySelectorAll<HTMLElement>("[data-glass-row]")
      expect(player().getAttribute("data-stacked")).toBe("true")
      expect(rows).toHaveLength(2)
      expect(rows[0].contains(progress())).toBe(true)
      expect(rows[1].contains(volumeSlider())).toBe(true)
      expect(rows[1].contains(muteButton())).toBe(true)
    })

    it("lets the progress take the width of the screen, not what is left beside the volume", () => {
      mount({ memory: both }, PHONE)
      expect(player().style.width).toContain("100% - 2rem")
      expect(player().querySelector("[data-glass-row]")!.contains(volumeSlider())).toBe(false)
    })

    it("keeps the volume slider at 96 px or more, at 360 px too", () => {
      mount({ memory: both }, PHONE)
      expect(widthOf(volumeSlider())).toBeGreaterThanOrEqual(96)
      expect(volumeSlider().className).not.toMatch(/max-\[/)
    })

    it("keeps the controls in one row on a wide screen", () => {
      mount({ memory: both })
      expect(player().getAttribute("data-stacked")).toBeNull()
      expect(player().querySelectorAll("[data-glass-row]")).toHaveLength(1)
      expect(widthOf(volumeSlider())).toBeGreaterThanOrEqual(96)
    })

    it("makes every control in the player at least 44 px tall", () => {
      mount({ memory: both }, PHONE)
      expect(progress().className).toContain("mem-range")
      for (const row of player().querySelectorAll<HTMLElement>("[data-glass-row]")) expect(row.className).toMatch(/h-(11|12)/)
    })
  })

  describe("labels and targets", () => {
    it("names every control in Spanish", () => {
      mount({ memory: both })
      expect(audioButton().getAttribute("aria-label")).toBe("Reproducir audio")
      expect(progress().getAttribute("aria-label")).toBe("Progreso del audio")
      expect(volumeSlider().getAttribute("aria-label")).toBe("Volumen")
      expect(muteButton()).toBeTruthy()
    })

    it("gives the mute button a 44 px target", () => {
      mount({ memory: both })
      expect(muteButton().className).toContain("size-11")
    })
  })
})

describe("GlassView particles", () => {
  let ctx: { fillStyle: string; globalAlpha: number; globalCompositeOperation: string; setTransform: ReturnType<typeof vi.fn>; clearRect: ReturnType<typeof vi.fn>; beginPath: ReturnType<typeof vi.fn>; arc: ReturnType<typeof vi.fn>; fill: ReturnType<typeof vi.fn> }
  const particles = () => dialog().querySelector<HTMLCanvasElement>("[data-orb-particles]")

  beforeEach(() => {
    ctx = {
      fillStyle: "",
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    }
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ctx) as never)
  })

  it("lays a canvas around the sphere of a memory with a voice", () => {
    mount({ memory: both })
    const canvas = particles()!
    const sphere = dialog().querySelector<HTMLElement>("[data-glass-sphere]")!
    expect(canvas).not.toBeNull()
    // Bigger than the sphere, and not inside it: nothing the sphere clips can cut a particle.
    expect(parseFloat(canvas.style.width)).toBeGreaterThan(parseFloat(sphere.style.width) * 2)
    expect(sphere.contains(canvas)).toBe(false)
  })

  it("has none for a photo-only memory", () => {
    mount()
    expect(particles()).toBeNull()
  })

  it("has none under reduced motion", () => {
    mount({ memory: both, reduced: true })
    expect(particles()).toBeNull()
  })

  it("throws nothing off while it is paused", () => {
    mount({ memory: both })
    runFrames(40)
    expect(ctx.arc).not.toHaveBeenCalled()
  })

  it("throws particles off, in the orb color, while it plays", () => {
    mount({ memory: view("b", "La casa nueva", { audio: voice, orbColor: "#ff9a3c" }) })
    fireEvent.click(audioButton())
    runFrames(60)
    expect(ctx.arc.mock.calls.length).toBeGreaterThan(20)
    expect(ctx.fillStyle).toBe("rgb(255, 154, 60)")
  })

  it("stops throwing them off when it is paused, and lets the rest fade out", () => {
    mount({ memory: both })
    fireEvent.click(audioButton())
    runFrames(60)
    fireEvent.click(audioButton())
    runFrames(200)
    const drawn = ctx.arc.mock.calls.length
    runFrames(30)
    expect(ctx.arc.mock.calls.length).toBe(drawn)
  })

  it("is gone when the view closes", () => {
    const { again } = mount({ memory: both })
    fireEvent.click(audioButton())
    runFrames(30)
    again({ memory: null })
    ctx.arc.mockClear()
    runFrames(30)
    expect(ctx.arc).not.toHaveBeenCalled()
  })
})

describe("GlassView next and previous", () => {
  const prev = view("x", "Antes")
  const next = view("y", "Después")

  it("moves with the arrow keys and the on-screen buttons", () => {
    const { props } = mount({ prev, next })
    fireEvent.keyDown(dialog(), { key: "ArrowRight" })
    expect(props.onStep).toHaveBeenLastCalledWith("y")
    fireEvent.keyDown(dialog(), { key: "ArrowLeft" })
    expect(props.onStep).toHaveBeenLastCalledWith("x")
    fireEvent.click(within(dialog()).getByRole("button", { name: "Siguiente" }))
    expect(props.onStep).toHaveBeenLastCalledWith("y")
    fireEvent.click(within(dialog()).getByRole("button", { name: "Anterior" }))
    expect(props.onStep).toHaveBeenLastCalledWith("x")
  })

  it("keeps the memories on either side warm while it is open, so a step lands on a sharp photo", () => {
    const { props } = mount({ prev, next })
    expect(props.onWarm).toHaveBeenCalledWith(prev)
    expect(props.onWarm).toHaveBeenCalledWith(next)
  })

  it("stops at the ends", () => {
    const { props } = mount({ prev: null, next: null })
    fireEvent.keyDown(dialog(), { key: "ArrowRight" })
    fireEvent.keyDown(dialog(), { key: "ArrowLeft" })
    expect(props.onStep).not.toHaveBeenCalled()
    expect((within(dialog()).getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(dialog()).getByRole("button", { name: "Siguiente" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("turns the page on a swipe, like a photo viewer", () => {
    const { props } = mount({ prev, next })
    const sphere = dialog().querySelector("[data-glass-sphere]")!
    fireEvent.pointerDown(sphere, { pointerType: "touch", clientX: 300, clientY: 400 })
    fireEvent.pointerUp(sphere, { pointerType: "touch", clientX: 180, clientY: 410 })
    expect(props.onStep).toHaveBeenLastCalledWith("y")
    fireEvent.pointerDown(sphere, { pointerType: "touch", clientX: 100, clientY: 400 })
    fireEvent.pointerUp(sphere, { pointerType: "touch", clientX: 240, clientY: 405 })
    expect(props.onStep).toHaveBeenLastCalledWith("x")
  })

  it("also turns the page on a swipe that starts on the caption or the empty stage", () => {
    const { props } = mount({ prev, next })
    const scrim = document.querySelector(".mem-scrim")!
    fireEvent.pointerDown(scrim, { pointerType: "touch", clientX: 300, clientY: 700 })
    fireEvent.pointerUp(scrim, { pointerType: "touch", clientX: 160, clientY: 705 })
    expect(props.onStep).toHaveBeenLastCalledWith("y")
    const caption = dialog().querySelector("[data-glass-caption]")!
    fireEvent.pointerDown(caption, { pointerType: "touch", clientX: 100, clientY: 700 })
    fireEvent.pointerUp(caption, { pointerType: "touch", clientX: 260, clientY: 704 })
    expect(props.onStep).toHaveBeenLastCalledWith("x")
  })

  it("puts the caption beside the sphere on a short landscape screen", () => {
    mount({}, { width: 844, height: 390 })
    expect(dialog().querySelector("[data-glass-caption]")!.getAttribute("data-caption")).toBe("side")
  })

  it("centers the sphere on the layout anchor, so the side caption never overlaps it", () => {
    mount({}, { width: 844, height: 390 })
    const sphere = dialog().querySelector<HTMLElement>("[data-glass-sphere]")!
    const center = parseFloat(sphere.style.left) + parseFloat(sphere.style.width) / 2
    expect(center / 844).toBeCloseTo(0.32, 2)
  })

  it("keeps the caption under the sphere on a portrait phone", () => {
    mount({}, { width: 390, height: 844 })
    expect(dialog().querySelector("[data-glass-caption]")!.getAttribute("data-caption")).toBe("below")
  })

  it("does nothing on a tap", () => {
    const { props } = mount({ prev, next })
    const sphere = dialog().querySelector("[data-glass-sphere]")!
    fireEvent.pointerDown(sphere, { pointerType: "touch", clientX: 300, clientY: 400 })
    fireEvent.pointerUp(sphere, { pointerType: "touch", clientX: 304, clientY: 402 })
    expect(props.onStep).not.toHaveBeenCalled()
  })
})

describe("GlassView caption", () => {
  const LONG = "Una tarde cualquiera que se volvió inolvidable: caminamos sin rumbo, nos reímos de todo y terminamos cenando en la vereda."
  const prev = view("x", "Antes")
  const next = view("y", "Después")
  const caption = () => dialog().querySelector<HTMLElement>("[data-glass-caption]")!
  const titleOf = (text: string) => within(dialog()).getByText(text)
  const guestProps = (): Props => ({
    memory: view("l", LONG),
    prev,
    next,
    reduced: false,
    onStep: vi.fn(),
    onClose: vi.fn(),
    onRestoreFocus: vi.fn(),
    onWarm: vi.fn(),
    lens: null,
    travel: () => null,
    switching: false,
  })

  /** Gives every element a layout, so a clamped title measures as taller than the box it is clamped to. */
  function clampTo(box: { scroll: number; client: number }) {
    vi.spyOn(Element.prototype, "scrollHeight", "get").mockReturnValue(box.scroll)
    vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(box.client)
  }

  describe("size", () => {
    it("steps the title down as the caption gets longer", () => {
      mount({ memory: view("s", "Una tarde de lluvia") })
      expect(titleOf("Una tarde de lluvia").getAttribute("data-size")).toBe("lg")
      cleanup()
      const medium = "x".repeat(60)
      mount({ memory: view("m", medium) })
      expect(titleOf(medium).getAttribute("data-size")).toBe("md")
      cleanup()
      mount({ memory: view("l", LONG) })
      expect(titleOf(LONG).getAttribute("data-size")).toBe("sm")
    })

    it("sets the title with a reading line height, not the tight one of a display heading", () => {
      mount({ memory: view("l", LONG) })
      expect(titleOf(LONG).className).toMatch(/leading-\[1\.\d+\]/)
    })

    it("keeps the date, place and views at 12 px or more", () => {
      const place = { lat: -34.59, lng: -58.42, name: "Palermo, Buenos Aires" }
      mount({ memory: view("p", "Una tarde de lluvia", { place, viewCount: 5 }) })
      const small = Array.from(caption().querySelectorAll("p")).filter((p) => /text-\[(?:[0-9]|1[01])px\]/.test(p.className))
      expect(small).toEqual([])
    })
  })

  describe("clamp and expand", () => {
    const toggle = () => within(dialog()).queryByRole("button", { name: /^Ver (más|menos)$/ })

    it("clamps the title to a few lines, and keeps every word in the dialog's name", () => {
      mount({ memory: view("l", LONG) })
      expect(titleOf(LONG).className).toContain("line-clamp-3")
      expect(screen.getByRole("dialog", { name: LONG })).toBeTruthy()
    })

    it("offers nothing to expand while the whole caption fits", () => {
      clampTo({ scroll: 60, client: 60 })
      mount({ memory: view("s", "Una tarde de lluvia") })
      expect(toggle()).toBeNull()
    })

    it("offers Ver más once the caption is cut, and says it is collapsed", () => {
      clampTo({ scroll: 140, client: 60 })
      mount({ memory: view("l", LONG) })
      const button = toggle()!
      expect(button.textContent).toBe("Ver más")
      expect(button.getAttribute("aria-expanded")).toBe("false")
      expect(button.getAttribute("aria-controls")).toBe(caption().querySelector("[data-glass-text]")!.id)
    })

    it("expands to the whole caption in a panel that scrolls, and collapses again", () => {
      clampTo({ scroll: 140, client: 60 })
      mount({ memory: view("l", LONG) })
      fireEvent.click(toggle()!)
      const button = within(dialog()).getByRole("button", { name: "Ver menos" })
      expect(button.getAttribute("aria-expanded")).toBe("true")
      expect(titleOf(LONG).className).not.toContain("line-clamp")
      const panel = caption().querySelector<HTMLElement>("[data-glass-panel]")!
      expect(panel.className).toContain("overflow-y-auto")
      expect(panel.getAttribute("data-expanded")).toBe("true")
      fireEvent.click(button)
      expect(titleOf(LONG).className).toContain("line-clamp-3")
      expect(toggle()!.getAttribute("aria-expanded")).toBe("false")
    })

    it("starts collapsed on the next memory", () => {
      clampTo({ scroll: 140, client: 60 })
      const { again } = mount({ memory: view("l", LONG) })
      fireEvent.click(toggle()!)
      again({ memory: view("m", `${LONG} Y después.`) })
      expect(toggle()!.getAttribute("aria-expanded")).toBe("false")
    })

    it("is a 44 px target", () => {
      clampTo({ scroll: 140, client: 60 })
      mount({ memory: view("l", LONG) })
      expect(toggle()!.className).toContain("h-11")
    })

    it("lets the panel pan vertically, so it scrolls on a touch screen", () => {
      mount({ memory: view("l", LONG) })
      expect(caption().querySelector("[data-glass-panel]")!.className).toContain("touch-pan-y")
    })
  })

  describe("room", () => {
    it("is bounded between the sphere and the bottom of the screen, never past it", () => {
      mount({ memory: view("l", LONG), prev, next }, { width: 360, height: 740 })
      expect(caption().className).toMatch(/bottom-\[max\(/)
      expect(caption().style.top).not.toBe("")
    })

    it("starts under the player row when the memory has a voice", () => {
      const viewport = { width: 360, height: 740 }
      mount({ memory: view("l", LONG, { audio: voice }), prev, next }, viewport)
      const geometry = lensGeometry(viewport, 1)
      const player = dialog().querySelector<HTMLElement>("[data-glass-player]")!
      const playerBottom = parseFloat(player.style.top) + (geometry.player - 4)
      expect(parseFloat(caption().style.top)).toBeGreaterThanOrEqual(playerBottom)
    })

    it("leaves the bottom corner to the guest's way in, so the two never meet", () => {
      render(<GlassView {...guestProps()} guestExit={vi.fn()} container={document.body} viewport={DESKTOP} />)
      expect(caption().className).toMatch(/bottom-\[max\(5rem/)
      const link = within(dialog()).getByRole("link", { name: "Entrar al universo" })
      expect(link.className).toMatch(/bottom-\[max\(1\.5rem/)
    })

    it("keeps the column bounded beside the sphere on a short landscape screen", () => {
      mount({ memory: view("l", LONG), prev, next }, { width: 844, height: 390 })
      expect(caption().getAttribute("data-caption")).toBe("side")
      expect(caption().className).toMatch(/max-h-/)
    })
  })

  describe("previous and next", () => {
    it("sit in a row of their own, so they never squeeze the text", () => {
      mount({ memory: view("l", LONG), prev, next }, { width: 360, height: 740 })
      const nav = caption().querySelector<HTMLElement>("[data-glass-nav]")!
      const previous = within(dialog()).getByRole("button", { name: "Anterior" })
      const following = within(dialog()).getByRole("button", { name: "Siguiente" })
      expect(nav.contains(previous) && nav.contains(following)).toBe(true)
      expect(nav.contains(titleOf(LONG))).toBe(false)
      expect(caption().querySelector("[data-glass-panel]")!.contains(previous)).toBe(false)
    })

    it("keep their labels and 48 px targets, and the keyboard still turns the page", () => {
      const { props } = mount({ memory: view("l", LONG), prev, next }, { width: 360, height: 740 })
      for (const name of ["Anterior", "Siguiente"]) {
        expect(within(dialog()).getByRole("button", { name }).className).toContain("size-12")
      }
      fireEvent.keyDown(dialog(), { key: "ArrowRight" })
      expect(props.onStep).toHaveBeenLastCalledWith("y")
    })

    it("are absent for a guest, who has nothing to step to", () => {
      render(<GlassView {...guestProps()} guestExit={vi.fn()} container={document.body} viewport={DESKTOP} />)
      expect(caption().querySelector("[data-glass-nav]")).toBeNull()
    })
  })
})

/** A lens the test drives: whether it can draw, and what it is asked to do. */
function fakeLens(available = true) {
  const canvas = document.createElement("canvas")
  let failed: (() => void) | null = null
  const lens = {
    canvas,
    prepare: vi.fn(() => available),
    available: vi.fn(() => available),
    onFail: vi.fn((listener: () => void) => {
      failed = listener
      return () => {
        failed = null
      }
    }),
    resize: vi.fn(),
    attach: vi.fn((holder: HTMLElement) => holder.appendChild(canvas)),
    detach: vi.fn(() => canvas.remove()),
    show: vi.fn(),
    reset: vi.fn(),
    open: vi.fn(),
    release: vi.fn(),
    frame: vi.fn((_now: number, input: { level: number; reduced: boolean; travel: number | null }) => ({
      glow: input.reduced ? input.level * 0.45 : input.level,
      glass: 1,
    })),
    dispose: vi.fn(),
  }
  return { lens: lens as unknown as Lens & typeof lens, lose: () => act(() => failed?.()) }
}

describe("GlassView renderer selection", () => {
  it("is a CSS glass circle when there is no lens that can draw", () => {
    mount({ lens: fakeLens(false).lens })
    const sphere = dialog().querySelector("[data-glass-sphere]")!
    expect(sphere.getAttribute("data-glass")).toBe("css")
    expect(dialog().querySelector("canvas")).toBeNull()
  })

  it("draws the refracting glass on the lens canvas, which the sphere adopts, sized to whole device pixels", () => {
    const { lens } = fakeLens()
    mount({ lens }, { ...DESKTOP, dpr: 2 })
    const sphere = dialog().querySelector<HTMLElement>("[data-glass-sphere]")!
    expect(sphere.getAttribute("data-glass")).toBe("webgl")
    expect(sphere.contains(lens.canvas)).toBe(true)
    const geometry = lensGeometry(DESKTOP, 2)
    expect(lens.resize).toHaveBeenCalledWith({
      device: geometry.canvas.device,
      deviceDiameter: Math.round(geometry.diameter * 2),
      diameter: geometry.diameter,
      dpr: 2,
    })
    expect(lens.attach).toHaveBeenCalledWith(expect.any(HTMLElement), {
      offset: (geometry.canvas.css - geometry.diameter) / 2,
      size: geometry.canvas.css,
    })
  })

  it("shows the memory and condenses the glass when it opens, and melts it back when it closes", () => {
    const { lens } = fakeLens()
    const { again } = mount({ lens })
    expect(lens.show).toHaveBeenCalledWith(photo)
    expect(lens.open).toHaveBeenCalledTimes(1)
    expect(lens.release).not.toHaveBeenCalled()
    again({ memory: null })
    expect(lens.release).toHaveBeenCalledTimes(1)
  })

  it("draws a frame on every animation frame while open", () => {
    const { lens } = fakeLens()
    mount({ lens })
    runFrames(3)
    expect(lens.frame).toHaveBeenCalledTimes(3)
  })

  it("gives the canvas back and forgets the memory once the glass has gone", () => {
    const { lens } = fakeLens()
    const { unmount } = mount({ lens })
    unmount()
    expect(lens.canvas.isConnected).toBe(false)
    expect(lens.reset).toHaveBeenCalled()
  })

  it("keeps the photo as an accessible image beside the canvas", () => {
    mount({ lens: fakeLens().lens })
    expect(within(dialog()).getByRole("img", { name: "Una tarde de lluvia" })).toBeTruthy()
  })

  it("falls back to the CSS glass if the GL context is lost", () => {
    const { lens, lose } = fakeLens()
    mount({ lens })
    lose()
    expect(dialog().querySelector("[data-glass-sphere]")!.getAttribute("data-glass")).toBe("css")
  })

  it("draws its soft halo in CSS around the sphere, outside the canvas, where nothing can clip it", () => {
    const { lens } = fakeLens()
    mount({ lens })
    const sphere = dialog().querySelector<HTMLElement>("[data-glass-sphere]")!
    const halo = sphere.querySelector<HTMLElement>("[data-glass-halo]")!
    expect(halo).not.toBeNull()
    expect(lens.canvas.contains(halo)).toBe(false)
    expect(halo.getAttribute("aria-hidden")).toBe("true")
  })
})

describe("GlassView switching memories", () => {
  const other = view("o", "Otra tarde")

  it("keeps the sphere and its lens while it moves to another memory, and dissolves into it", () => {
    const { lens } = fakeLens()
    const { again } = mount({ lens })
    again({ memory: other, lens })
    expect(lens.detach).not.toHaveBeenCalled()
    expect(lens.show).toHaveBeenLastCalledWith(other)
    expect(lens.release).not.toHaveBeenCalled()
  })

  it("tells the lens how far the camera has carried the world on the switch", () => {
    const { lens } = fakeLens()
    mount({ lens, travel: () => 0.4 })
    runFrames(2)
    expect(lens.frame.mock.calls.at(-1)![1]).toMatchObject({ travel: 0.4 })
  })

  it("lets the caption go, then brings the next one in once the camera is half way", () => {
    let travel: number | null = 0.1
    const reader = () => travel
    const { again } = mount({ travel: reader })
    again({ memory: other, travel: reader, switching: true })
    runFrames(1)
    const leaving = dialog().querySelector("[data-glass-caption]")!
    expect(leaving.textContent).toContain("Una tarde de lluvia")
    expect(leaving.getAttribute("data-leaving")).toBe("true")
    travel = 0.6
    runFrames(1)
    const entering = dialog().querySelector("[data-glass-caption]")!
    expect(entering.textContent).toContain("Otra tarde")
    expect(entering.hasAttribute("data-leaving")).toBe(false)
    expect(entering.getAttribute("data-entering")).toBe("true")
    expect(screen.getByRole("dialog", { name: "Otra tarde" })).toBeTruthy()
  })

  it("swaps the caption at once when there is no travel (a cut under reduced motion, or a landed step)", () => {
    const { again } = mount({ reduced: true })
    again({ memory: other, reduced: true, switching: true })
    runFrames(1)
    expect(dialog().querySelector("[data-glass-caption]")!.textContent).toContain("Otra tarde")
  })

  it("puts the caption of the memory it landed on once the switch is over", () => {
    const { again } = mount({ travel: () => 0.1 })
    again({ memory: other, travel: () => 0.1, switching: true })
    expect(dialog().querySelector("[data-glass-caption]")!.textContent).toContain("Una tarde de lluvia")
    again({ memory: other, travel: () => null, switching: false })
    expect(dialog().querySelector("[data-glass-caption]")!.textContent).toContain("Otra tarde")
  })

  it("stops the voice of the memory it leaves at once", () => {
    const { again } = mount({ memory: both })
    fireEvent.click(audioButton())
    pause.mockClear()
    again({ memory: other })
    expect(pause).toHaveBeenCalled()
  })
})

describe("GlassView talking", () => {
  const talk = (reduced: boolean) => {
    const { lens } = fakeLens()
    mount({ memory: both, reduced, lens })
    fireEvent.click(audioButton())
    runFrames(80)
    return lens.frame.mock.calls.map((c) => c[1] as { level: number; reduced: boolean })
  }

  it("hands the voice to the glass every frame while it plays", () => {
    const inputs = talk(false)
    expect(Math.max(...inputs.map((i) => i.level))).toBeGreaterThan(0.2)
    expect(inputs.every((i) => i.reduced === false)).toBe(true)
  })

  it("tells the glass when motion is reduced", () => {
    const inputs = talk(true)
    expect(inputs.every((i) => i.reduced)).toBe(true)
  })

  it("lights the halo with the voice", () => {
    talk(false)
    const sphere = dialog().querySelector<HTMLElement>("[data-glass-sphere]")!
    expect(Number(sphere.style.getPropertyValue("--glow"))).toBeGreaterThan(0.2)
  })

  it("marks the sphere as reduced", () => {
    mount({ reduced: true })
    expect(dialog().querySelector("[data-glass-sphere]")!.getAttribute("data-reduced")).toBe("true")
  })
})

describe("GlassView as a guest (a shared memory)", () => {
  const exit = vi.fn()
  const guestProps = () => ({ guestExit: exit })
  beforeEach(() => exit.mockReset())

  function mountGuest(over: Partial<Props> = {}) {
    const props: Props = {
      memory: photo,
      prev: both,
      next: audioOnly,
      reduced: false,
      onStep: vi.fn(),
      onClose: vi.fn(),
      onRestoreFocus: vi.fn(),
      onWarm: vi.fn(),
      lens: null,
      travel: () => null,
      switching: false,
      ...over,
    }
    render(<GlassView {...props} {...guestProps()} container={document.body} viewport={DESKTOP} />)
    return props
  }

  it("has no previous or next controls, even when there are neighbours", () => {
    mountGuest()
    expect(within(dialog()).queryByRole("button", { name: "Anterior" })).toBeNull()
    expect(within(dialog()).queryByRole("button", { name: "Siguiente" })).toBeNull()
  })

  it("does not step on the arrow keys or on a swipe, and does not warm neighbours", () => {
    const props = mountGuest()
    fireEvent.keyDown(dialog(), { key: "ArrowRight" })
    fireEvent.keyDown(dialog(), { key: "ArrowLeft" })
    const sphere = dialog().querySelector("[data-glass-sphere]") as HTMLElement
    fireEvent.pointerDown(sphere, { clientX: 700, clientY: 400 })
    fireEvent.pointerUp(sphere, { clientX: 300, clientY: 410 })
    expect(props.onStep).not.toHaveBeenCalled()
    expect(props.onWarm).not.toHaveBeenCalled()
  })

  it("does not leave on a wheel away from the sphere: only the exits leave", () => {
    const props = mountGuest()
    fireEvent.wheel(dialog().querySelector("[data-glass-sphere]") as HTMLElement, { deltaY: 120 })
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it("leaves on Esc, through the same close the dialog always calls", () => {
    const props = mountGuest()
    fireEvent.keyDown(dialog(), { key: "Escape" })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it("offers Universo, which exits", () => {
    mountGuest()
    fireEvent.click(within(dialog()).getByRole("button", { name: /Universo/ }))
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it("offers a quiet Entrar al universo link to the start", () => {
    mountGuest()
    const link = within(dialog()).getByRole("link", { name: "Entrar al universo" })
    expect(link.getAttribute("href")).toBe("/")
  })

  it("is not a guest view without guestExit: it offers neither exit", () => {
    mount()
    expect(within(dialog()).queryByRole("link", { name: "Entrar al universo" })).toBeNull()
    expect(within(dialog()).queryByRole("button", { name: /Universo/ })).toBeNull()
  })
})

describe("GlassView share control", () => {
  const share = vi.fn<(id: string) => Promise<ShareMemoryResult>>(async () => ({ ok: true, url: "https://example.com/m/t" }))
  beforeEach(() => share.mockClear())

  it("offers Compartir for an approved memory when it can share", () => {
    mount({ share })
    expect(within(dialog()).getByRole("button", { name: "Compartir" })).toBeTruthy()
  })

  it("never offers it for a pending memory", () => {
    mount({ memory: { ...photo, status: "pending" }, share })
    expect(within(dialog()).queryByRole("button", { name: "Compartir" })).toBeNull()
  })

  it("offers nothing when there is no way to share", () => {
    mount()
    expect(within(dialog()).queryByRole("button", { name: "Compartir" })).toBeNull()
  })

  it("keeps Cerrar beside it", () => {
    mount({ share })
    expect(within(dialog()).getByRole("button", { name: "Cerrar" })).toBeTruthy()
  })

  it("does not steal the initial focus: it lands on Cerrar, as before, and Compartir is next in Tab order", () => {
    mount({ share })
    expect(document.activeElement).toBe(within(dialog()).getByRole("button", { name: "Cerrar" }))
    const buttons = within(dialog()).getAllByRole("button")
    expect(buttons.indexOf(within(dialog()).getByRole("button", { name: "Compartir" }))).toBe(
      buttons.indexOf(within(dialog()).getByRole("button", { name: "Cerrar" })) + 1,
    )
  })

  it("prefetches the link of the memory on open, once per memory for the whole session", async () => {
    const view = mount({ share })
    await act(async () => {})
    expect(share).toHaveBeenCalledTimes(1)
    expect(share).toHaveBeenCalledWith("p")
    view.again({ memory: null })
    view.again({ share, memory: photo })
    await act(async () => {})
    expect(share).toHaveBeenCalledTimes(1)
  })

  it("does not prefetch for a pending memory", async () => {
    mount({ memory: { ...photo, status: "pending" }, share })
    await act(async () => {})
    expect(share).not.toHaveBeenCalled()
  })
})

describe("GlassView views", () => {
  const onView = vi.fn<(id: string) => Promise<RecordViewResult>>()
  const settle = () => act(async () => {})
  const views = () => dialog().querySelector<HTMLElement>("[data-glass-views]")
  const seen = (viewCount: number, id = "p", over: Partial<MemoryView> = {}) =>
    view(id, "Una tarde de lluvia", { viewCount, ...over })
  const other = view("o", "Otra tarde")
  const guestProps = () => ({
    memory: seen(7),
    prev: null,
    next: null,
    reduced: false,
    onStep: vi.fn(),
    onClose: vi.fn(),
    onRestoreFocus: vi.fn(),
    lens: null,
    guestExit: vi.fn(),
  })

  beforeEach(() => {
    onView.mockReset()
    onView.mockResolvedValue({ ok: true, counted: false })
  })

  describe("recording", () => {
    it("records the memory it opens on, once", async () => {
      mount({ onView })
      await settle()
      expect(onView).toHaveBeenCalledTimes(1)
      expect(onView).toHaveBeenCalledWith("p")
    })

    it("records nothing while it is closed", async () => {
      mount({ memory: null, onView })
      await settle()
      expect(onView).not.toHaveBeenCalled()
    })

    it("never records a pending memory", async () => {
      mount({ memory: view("p", "Mío", { status: "pending" }), onView })
      await settle()
      expect(onView).not.toHaveBeenCalled()
    })

    it("does not record the neighbours it warms for the next step: a prefetch is not an open", async () => {
      const { props } = mount({ prev: both, next: audioOnly, onView })
      await settle()
      expect(props.onWarm).toHaveBeenCalled()
      expect(onView.mock.calls.map((c) => c[0])).toEqual(["p"])
    })

    it("does not record a memory the camera is still carrying the world to, only once it has landed", async () => {
      const { again } = mount({ onView })
      await settle()
      onView.mockClear()
      again({ memory: other, switching: true, onView })
      await settle()
      expect(onView).not.toHaveBeenCalled()
      again({ memory: other, switching: false, onView })
      await settle()
      expect(onView).toHaveBeenCalledTimes(1)
      expect(onView).toHaveBeenCalledWith("o")
    })

    it("does not record the memories it only passes through on rapid steps", async () => {
      const { again } = mount({ onView })
      const second = view("s", "Segunda")
      const third = view("t", "Tercera")
      again({ memory: other, switching: true, onView })
      again({ memory: second, switching: true, onView })
      again({ memory: third, switching: true, onView })
      again({ memory: third, switching: false, onView })
      await settle()
      expect(onView.mock.calls.map((c) => c[0])).toEqual(["p", "t"])
    })

    it("records each memory once for the whole session, however often it is opened again", async () => {
      const { again } = mount({ onView })
      again({ memory: other, onView })
      again({ memory: photo, onView })
      again({ memory: null, onView })
      again({ memory: photo, onView })
      again({ memory: other, onView })
      await settle()
      expect(onView.mock.calls.map((c) => c[0])).toEqual(["p", "o"])
    })

    it("does not record again when it only re-renders", async () => {
      const { again } = mount({ onView })
      again({ reduced: true, onView })
      again({ travel: () => 0.2, onView })
      await settle()
      expect(onView).toHaveBeenCalledTimes(1)
    })

    it("never records for a guest holding a share link, even when it could", async () => {
      render(<GlassView {...guestProps()} container={document.body} viewport={DESKTOP} onView={onView} />)
      await settle()
      expect(onView).not.toHaveBeenCalled()
    })

    it("records nothing when there is no way to (no onView), and does not break", async () => {
      mount()
      await settle()
      expect(dialog()).toBeTruthy()
    })

    it("survives a call that fails", async () => {
      onView.mockRejectedValue(new Error("offline"))
      mount({ memory: seen(3), onView })
      await settle()
      expect(views()?.textContent).toBe("3 vistas")
    })
  })

  describe("showing", () => {
    it("says nothing at zero", () => {
      mount({ memory: seen(0) })
      expect(views()).toBeNull()
    })

    it("says 1 vista for one and N vistas for more", () => {
      mount({ memory: seen(1) })
      expect(views()?.textContent).toBe("1 vista")
      cleanup()
      mount({ memory: seen(12) })
      expect(views()?.textContent).toBe("12 vistas")
    })

    it("groups thousands the Spanish way", () => {
      mount({ memory: seen(12345) })
      expect(views()?.textContent).toBe("12.345 vistas")
    })

    it("is quiet plain text after the date: not a control, and not announced when it changes", () => {
      mount({ memory: seen(12) })
      const el = views()!
      expect(el.tagName).toBe("P")
      expect(el.getAttribute("aria-live")).toBe("off")
      expect(el.querySelector("button, a")).toBeNull()
      const date = within(dialog()).getByText("12 de marzo de 2024")
      expect(date.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it("shows the count to a guest too", () => {
      render(<GlassView {...guestProps()} container={document.body} viewport={DESKTOP} />)
      expect(views()?.textContent).toBe("7 vistas")
    })

    it("shows the count of the memory it switches to once the caption swaps", () => {
      const { again } = mount({ memory: seen(2) })
      again({ memory: view("o", "Otra tarde", { viewCount: 40 }) })
      expect(views()?.textContent).toBe("40 vistas")
    })
  })

  describe("the optimistic count", () => {
    it("adds one when this visitor was counted for the first time", async () => {
      onView.mockResolvedValue({ ok: true, counted: true })
      mount({ memory: seen(12), onView })
      expect(views()?.textContent).toBe("12 vistas")
      await settle()
      expect(views()?.textContent).toBe("13 vistas")
    })

    it("shows 1 vista for the first view of a memory nobody had opened", async () => {
      onView.mockResolvedValue({ ok: true, counted: true })
      mount({ memory: seen(0), onView })
      expect(views()).toBeNull()
      await settle()
      expect(views()?.textContent).toBe("1 vista")
    })

    it("adds nothing for a visitor who was already counted", async () => {
      onView.mockResolvedValue({ ok: true, counted: false })
      mount({ memory: seen(12), onView })
      await settle()
      expect(views()?.textContent).toBe("12 vistas")
    })

    it("adds nothing when the view was refused (the author, a pending memory) or failed", async () => {
      for (const reason of ["not_countable", "no_session", "unavailable"] as const) {
        onView.mockResolvedValue({ ok: false, reason })
        mount({ memory: seen(12), onView })
        await settle()
        expect(views()?.textContent, reason).toBe("12 vistas")
        cleanup()
      }
    })

    it("adds one once per memory: opening it again later does not add another", async () => {
      onView.mockResolvedValue({ ok: true, counted: true })
      const { again } = mount({ memory: seen(12), onView })
      await settle()
      again({ memory: other, onView })
      await settle()
      again({ memory: seen(12), onView })
      await settle()
      expect(views()?.textContent).toBe("13 vistas")
    })

    it("adds nothing without a way to record (a guest, or no onView)", async () => {
      mount({ memory: seen(12) })
      await settle()
      expect(views()?.textContent).toBe("12 vistas")
    })
  })
})
