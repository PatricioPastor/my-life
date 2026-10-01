import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import { GlassView } from "./glass-view"

const probe = vi.hoisted(() => vi.fn(() => ({ webgl2: false })))
const makeRenderer = vi.hoisted(() => vi.fn())
vi.mock("@/features/onboarding/gpu-probe", () => ({ probeRenderer: probe }))
vi.mock("./glass-renderer", () => ({ createGlassRenderer: makeRenderer }))
// jsdom has no Web Audio: a voice that is loud while it plays stands in for the analyser.
vi.mock("./use-audio-level", () => ({ useAudioLevel: (_source: unknown, active: boolean) => () => (active ? 0.6 : 0) }))

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
  thumbUrl: `https://res.cloudinary.com/demo/t/${id}`,
  fullUrl: `https://res.cloudinary.com/demo/f/${id}`,
  audio: null,
  ...over,
})

const voice = { url: "https://res.cloudinary.com/demo/video/a.mp3", durationMs: 65000 }
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
}

const DESKTOP = { width: 1440, height: 900 }

function mount(over: Partial<Props> = {}, viewport = DESKTOP) {
  const props: Props = {
    memory: photo,
    prev: null,
    next: null,
    reduced: false,
    onStep: vi.fn(),
    onClose: vi.fn(),
    onRestoreFocus: vi.fn(),
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
  probe.mockReturnValue({ webgl2: false })
  makeRenderer.mockReset()
  makeRenderer.mockReturnValue(null)
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

  it("goes back to play when the audio ends", () => {
    mount({ memory: both })
    fireEvent.click(audioButton())
    const audio = dialog().querySelector("audio")!
    act(() => {
      audio.dispatchEvent(new Event("ended"))
    })
    expect(audioButton().getAttribute("aria-pressed")).toBe("false")
  })

  it("loads the voice with CORS, from the signed URL", () => {
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
    expect(parseFloat(sphere.style.left)).toBeCloseTo(32, 0)
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

describe("GlassView renderer selection", () => {
  const fakeRenderer = () => ({ setPhoto: vi.fn(), draw: vi.fn(), dispose: vi.fn() })

  it("is a CSS glass circle when there is no WebGL2", () => {
    probe.mockReturnValue({ webgl2: false })
    mount()
    const sphere = dialog().querySelector("[data-glass-sphere]")!
    expect(sphere.getAttribute("data-glass")).toBe("css")
    expect(dialog().querySelector("canvas")).toBeNull()
    expect(makeRenderer).not.toHaveBeenCalled()
  })

  it("draws the refracting glass on a canvas when WebGL2 works", () => {
    probe.mockReturnValue({ webgl2: true })
    const renderer = fakeRenderer()
    makeRenderer.mockReturnValue(renderer)
    mount()
    const sphere = dialog().querySelector("[data-glass-sphere]")!
    expect(sphere.getAttribute("data-glass")).toBe("webgl")
    const canvas = dialog().querySelector("canvas")!
    expect(canvas.getAttribute("aria-hidden")).toBe("true")
    expect(makeRenderer).toHaveBeenCalledTimes(1)
    runFrames(2)
    expect(renderer.draw).toHaveBeenCalled()
  })

  it("keeps the photo as an accessible image beside the canvas", () => {
    probe.mockReturnValue({ webgl2: true })
    makeRenderer.mockReturnValue(fakeRenderer())
    mount()
    expect(within(dialog()).getByRole("img", { name: "Una tarde de lluvia" })).toBeTruthy()
  })

  it("falls back to the CSS glass when the renderer cannot be built", () => {
    probe.mockReturnValue({ webgl2: true })
    makeRenderer.mockReturnValue(null)
    mount()
    expect(dialog().querySelector("[data-glass-sphere]")!.getAttribute("data-glass")).toBe("css")
    expect(dialog().querySelector("canvas")).toBeNull()
  })

  it("tints the glass with the orb color", () => {
    probe.mockReturnValue({ webgl2: true })
    makeRenderer.mockReturnValue(fakeRenderer())
    mount({ memory: view("p", "Una tarde", { orbColor: "#4fd1b9" }) })
    expect(makeRenderer.mock.calls[0][1]).toMatchObject({ tint: [expect.any(Number), expect.any(Number), expect.any(Number)] })
    const tint = makeRenderer.mock.calls[0][1].tint as number[]
    expect(tint[1]).toBeGreaterThan(tint[0])
  })

  it("releases the renderer when it closes", () => {
    probe.mockReturnValue({ webgl2: true })
    const renderer = fakeRenderer()
    makeRenderer.mockReturnValue(renderer)
    const { again } = mount()
    again({ memory: null })
    expect(renderer.dispose).toHaveBeenCalled()
  })
})

describe("GlassView talking", () => {
  const talk = (reduced: boolean) => {
    probe.mockReturnValue({ webgl2: true })
    const renderer = { setPhoto: vi.fn(), draw: vi.fn(), dispose: vi.fn() }
    makeRenderer.mockReturnValue(renderer)
    mount({ memory: both, reduced })
    fireEvent.click(audioButton())
    runFrames(80)
    return renderer.draw.mock.calls.map((c) => c[0] as { warp: number; glow: number; time: number })
  }

  it("ripples the surface and glows while the voice plays", () => {
    const draws = talk(false)
    expect(Math.max(...draws.map((d) => d.warp))).toBeGreaterThan(0.2)
    expect(Math.max(...draws.map((d) => d.glow))).toBeGreaterThan(0.2)
  })

  it("under reduced motion only glows gently: no ripple, and a still clock", () => {
    const draws = talk(true)
    expect(Math.max(...draws.map((d) => d.warp))).toBe(0)
    expect(Math.max(...draws.map((d) => d.glow))).toBeGreaterThan(0.1)
    expect(Math.max(...draws.map((d) => d.glow))).toBeLessThan(0.6)
    expect(new Set(draws.map((d) => d.time))).toEqual(new Set([0]))
  })

  it("marks the sphere as reduced", () => {
    probe.mockReturnValue({ webgl2: false })
    mount({ reduced: true })
    expect(dialog().querySelector("[data-glass-sphere]")!.getAttribute("data-reduced")).toBe("true")
  })
})
