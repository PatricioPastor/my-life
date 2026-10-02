import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import type { ShareMemoryResult } from "../share/share-view"
import { lensGeometry } from "./glass-layout"
import { GlassView } from "./glass-view"
import type { Lens } from "./lens"
import * as readiness from "./audio-readiness"

// jsdom has no Web Audio: a voice that is loud while it plays stands in for the analyser.
vi.mock("./use-audio-level", () => ({ useAudioLevel: (_source: unknown, active: boolean) => () => (active ? 0.6 : 0) }))

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
    expect(within(dialog()).getByText("0:12 / 1:05")).toBeTruthy()
    act(() => {
      audio.dispatchEvent(new Event("ended"))
    })
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
