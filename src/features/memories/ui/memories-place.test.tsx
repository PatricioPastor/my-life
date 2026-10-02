import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import { rimColor } from "../orb-color"
import { lensGeometry } from "./glass-layout"
import { GLASS_RELEASE_MS } from "./lens"
import { MemoriesPlace, type MemoriesState } from "./memories-place"
import { TITLE_EASE, TITLE_FADE_OUT_MS, TITLE_HOLD_MS, TITLE_SHRINK_MS } from "./title-motion"
import { VOID_GLOWS } from "./void-glows"

// jsdom has no WebGL: the lens cannot be prepared, so the CSS glass is what these tests see.

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.stubGlobal("matchMedia", undefined)
})

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
  thumbUrl: `https://res.cloudinary.com/demo/image/upload/t/${id}`,
  fullUrl: `https://res.cloudinary.com/demo/image/upload/f/${id}`,
  audio: null,
  ...over,
})

const ready = (...memories: MemoryView[]): MemoriesState => ({ status: "ready", memories })
const three = ready(view("a", "El primer viaje"), view("b", "Una tarde de lluvia"), view("c", "La casa nueva"))

describe("MemoriesPlace states", () => {
  it("is titled Recuerdos", () => {
    render(<MemoriesPlace state={ready()} />)
    expect(screen.getByRole("heading", { level: 1, name: "Recuerdos" })).toBeTruthy()
  })

  it("shows a calm loading state while the action is pending", () => {
    render(<MemoriesPlace state={{ status: "loading" }} />)
    expect(screen.getByRole("status").textContent).toBe("Cargando recuerdos…")
    expect(screen.queryByRole("list")).toBeNull()
  })

  it("shows the empty state when there are no memories", () => {
    render(<MemoriesPlace state={ready()} />)
    expect(screen.getByText("Todavía no hay recuerdos.")).toBeTruthy()
  })

  it("says honestly when the memories cannot be loaded", () => {
    render(<MemoriesPlace state={{ status: "error", reason: "unavailable" }} />)
    expect(screen.getByRole("status").textContent).toBe("No pudimos cargar los recuerdos.")
  })

  it("asks to come back in when there is no session", () => {
    render(<MemoriesPlace state={{ status: "error", reason: "no_session" }} />)
    expect(screen.getByRole("status").textContent).toBe("Vuelve a entrar para ver los recuerdos.")
  })

  it("renders no controls of its own when there is nothing to open and no action", () => {
    render(<MemoriesPlace state={ready()} />)
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("renders the action slot reserved for adding a memory", () => {
    render(<MemoriesPlace state={ready()} action={<button type="button">Agregar recuerdo</button>} />)
    expect(screen.getByRole("button", { name: "Agregar recuerdo" })).toBeTruthy()
  })
})

describe("MemoriesPlace dimension", () => {
  afterEach(() => document.getElementById("gambarino-css")?.remove())

  it("sets the title in Gambarino, the display serif, never the pixel font", () => {
    render(<MemoriesPlace state={ready()} />)
    const title = screen.getByRole("heading", { level: 1, name: "Recuerdos" })
    expect(title.className).toContain("t-title")
    expect(title.className).not.toContain("font-display")
  })

  it("makes sure the Gambarino stylesheet is present when it mounts", () => {
    expect(document.getElementById("gambarino-css")).toBeNull()
    render(<MemoriesPlace state={ready()} />)
    const link = document.getElementById("gambarino-css") as HTMLLinkElement
    expect(link.href).toContain("api.fontshare.com")
  })

  it("brings its own opaque void, so the sky never shows through", () => {
    const { container } = render(<MemoriesPlace state={ready()} />)
    const dark = container.querySelector("[data-void]") as HTMLElement
    expect(dark.className).toContain("mem-void")
    expect(dark.getAttribute("aria-hidden")).toBe("true")
  })

  it("drifts its void: one very soft glow per configured glow, each on its own long cycle", () => {
    const { container } = render(<MemoriesPlace state={ready()} />)
    const dark = container.querySelector("[data-void]") as HTMLElement
    const glows = Array.from(dark.querySelectorAll<HTMLElement>(".mem-glow"))
    expect(glows).toHaveLength(VOID_GLOWS.length)
    expect(dark.getAttribute("data-reduced")).toBe("false")
    glows.forEach((glow, i) => {
      expect(glow.style.getPropertyValue("--glow-dur")).toBe(`${VOID_GLOWS[i].duration}s`)
      expect(glow.style.getPropertyValue("--glow-delay")).toBe(`${VOID_GLOWS[i].delay}s`)
    })
  })

  it("holds the void still under reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    const { container } = render(<MemoriesPlace state={ready()} />)
    expect((container.querySelector("[data-void]") as HTMLElement).getAttribute("data-reduced")).toBe("true")
  })

  it("sets each orb's seeded depth, which sizes and dims it", () => {
    render(<MemoriesPlace state={three} />)
    for (const point of screen.getAllByRole("button")) {
      const style = (point as HTMLElement).style
      expect(Number(style.getPropertyValue("--size").replace("px", ""))).toBeGreaterThanOrEqual(6)
      expect(Number(style.getPropertyValue("--alpha"))).toBeGreaterThanOrEqual(0.5)
    }
  })

  it("tints each orb with its own color: core, halo and rim", () => {
    render(
      <MemoriesPlace
        state={ready(view("a", "Uno", { orbColor: "#ff9a3c" }), view("b", "Dos", { orbColor: "#a58cff" }))}
      />,
    )
    const [a, b] = screen.getAllByRole("button") as HTMLElement[]
    expect(a.style.getPropertyValue("--pc")).toBe("#ff9a3c")
    expect(b.style.getPropertyValue("--pc")).toBe("#a58cff")
    // The rim is the neighbouring hue of the orb's own color, not another memory's.
    expect(a.style.getPropertyValue("--rim")).toBe(rimColor("#ff9a3c"))
    expect(b.style.getPropertyValue("--rim")).toBe(rimColor("#a58cff"))
    expect(a.style.getPropertyValue("--rim")).not.toBe(a.style.getPropertyValue("--pc"))
  })

  it("keeps an orb's color wherever it sits in the list", () => {
    const { rerender } = render(<MemoriesPlace state={ready(view("a", "Uno", { orbColor: "#ff9a3c" }))} />)
    rerender(
      <MemoriesPlace state={ready(view("z", "Cero", { orbColor: "#4fd1b9" }), view("a", "Uno", { orbColor: "#ff9a3c" }))} />,
    )
    const uno = screen.getByRole("button", { name: /Uno/ }) as HTMLElement
    expect(uno.style.getPropertyValue("--pc")).toBe("#ff9a3c")
  })

  it("speaks its states in the serif, quietly", () => {
    render(<MemoriesPlace state={{ status: "error", reason: "unavailable" }} />)
    expect(screen.getByRole("status").className).toContain("t-body")
  })
})

describe("MemoriesPlace points", () => {
  it("renders one button per memory, named by caption and Spanish date, in list order", () => {
    render(<MemoriesPlace state={three} />)
    const list = screen.getByRole("list", { name: "Recuerdos" })
    const names = within(list)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"))
    expect(names).toEqual([
      "El primer viaje, 12 de marzo de 2024",
      "Una tarde de lluvia, 12 de marzo de 2024",
      "La casa nueva, 12 de marzo de 2024",
    ])
  })

  it("makes each point a magnetic target labelled with the truncated caption and the date", () => {
    const long = "Una tarde de lluvia larguísima en la costa del sur del país"
    render(<MemoriesPlace state={ready(view("a", long))} />)
    const point = screen.getByRole("button")
    expect(point.getAttribute("data-magnetic")).toBe("light")
    expect(point.getAttribute("data-cursor-label")?.endsWith("…")).toBe(true)
    expect((point.getAttribute("data-cursor-label") ?? "").length).toBeLessThanOrEqual(28)
    expect(point.getAttribute("data-cursor-context")).toBe("12 de marzo de 2024")
  })

  it("marks the visitor's own pending memories, in the name and visibly", () => {
    render(<MemoriesPlace state={ready(view("a", "Mío", { status: "pending" }))} />)
    expect(screen.getByRole("button", { name: "Mío, 12 de marzo de 2024, pendiente" })).toBeTruthy()
    expect(screen.getByText("Pendiente")).toBeTruthy()
  })

  it("does not mark approved memories", () => {
    render(<MemoriesPlace state={three} />)
    expect(screen.queryByText("Pendiente")).toBeNull()
  })

  it("keeps a point hidden until its thumbnail has loaded, then reveals it", () => {
    const { container } = render(<MemoriesPlace state={ready(view("a", "Uno"))} />)
    const point = screen.getByRole("button")
    expect(point.getAttribute("data-ready")).toBe("false")
    fireEvent.load(container.querySelector("img")!)
    expect(point.getAttribute("data-ready")).toBe("true")
  })

  it("reveals a point whose thumbnail finished loading before the page took over", () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true)
    render(<MemoriesPlace state={ready(view("a", "Uno"))} />)
    expect(screen.getByRole("button").getAttribute("data-ready")).toBe("true")
    complete.mockRestore()
  })

  it("reveals a point whose thumbnail failed, so it is never lost", () => {
    const { container } = render(<MemoriesPlace state={ready(view("a", "Uno"))} />)
    fireEvent.error(container.querySelector("img")!)
    expect(screen.getByRole("button").getAttribute("data-ready")).toBe("true")
  })

  it("draws an audio-only orb as just its glow: no thumbnail to wait for", () => {
    const only = view("a", "Mi voz", { thumbUrl: null, fullUrl: null, width: null, height: null, audio: { url: "https://x/a.mp3", durationMs: 1000 } })
    const { container } = render(<MemoriesPlace state={ready(only)} />)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector(".mem-thumb")).toBeNull()
    expect(screen.getByRole("button").getAttribute("data-ready")).toBe("true")
  })

  it("holds the drift under reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    render(<MemoriesPlace state={three} />)
    expect(screen.getAllByRole("button")[0].getAttribute("data-reduced")).toBe("true")
  })

  it("drifts by default", () => {
    render(<MemoriesPlace state={three} />)
    expect(screen.getAllByRole("button")[0].getAttribute("data-reduced")).toBe("false")
  })
})

// ---- the approach: the camera flies to the orb, which opens into the glass -------------------------------------

let frames: Array<(now: number) => void> = []
let clock = 0

/** Drives the rAF loops by hand: the camera flies from the constellation loop's frames. */
function stubFrames() {
  frames = []
  clock = performance.now() + 100
  vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => frames.push(cb))
  vi.stubGlobal("cancelAnimationFrame", () => {})
}
function advance(count: number, ms = 100) {
  for (let i = 0; i < count; i++) {
    const batch = frames
    frames = []
    clock += ms
    act(() => batch.forEach((cb) => cb(clock)))
  }
}
function advanceUntil(done: () => boolean, max = 60) {
  for (let i = 0; i < max && !done(); i++) advance(1)
  expect(done()).toBe(true)
}

// Radix hides the rest of the stage from the accessibility tree while the glass is open, so find it by its data.
const stage = () => document.querySelector("[data-approach]") as HTMLElement
const phase = () => stage().getAttribute("data-approach")
const dialogOpen = () => screen.queryByRole("dialog") !== null
const orbAt = (name: RegExp | string) => screen.getByRole("button", { name, hidden: true }) as HTMLElement
const transformOf = (name: RegExp | string) => orbAt(name).parentElement?.style.transform

describe("MemoriesPlace approach", () => {
  beforeEach(stubFrames)

  /** Opens a memory by clicking its orb and flying until the glass is open. */
  function openGlass(name: RegExp | string) {
    fireEvent.click(orbAt(name))
    advanceUntil(dialogOpen)
  }

  it("flies the camera to the orb when it is clicked, and only opens the glass on arrival", () => {
    render(<MemoriesPlace state={three} />)
    expect(phase()).toBe("idle")
    fireEvent.click(orbAt(/Una tarde de lluvia/))
    expect(phase()).toBe("flying")
    expect(dialogOpen()).toBe(false)
    advance(2)
    expect(phase()).toBe("flying")
    expect(dialogOpen()).toBe(false)
    advanceUntil(dialogOpen)
    expect(phase()).toBe("open")
  })

  it("takes about a second to arrive, slowly at first", () => {
    render(<MemoriesPlace state={three} />)
    fireEvent.click(orbAt(/Una tarde de lluvia/))
    // 8 frames of 100 ms: still on the way (the flight lasts at least 0.9 s).
    advance(8)
    expect(dialogOpen()).toBe(false)
    advanceUntil(dialogOpen, 8)
  })

  it("opens the photo, caption and date in the glass", () => {
    render(<MemoriesPlace state={three} />)
    openGlass(/Una tarde de lluvia/)
    const dialog = screen.getByRole("dialog", { name: "Una tarde de lluvia" })
    expect(within(dialog).getByText("12 de marzo de 2024")).toBeTruthy()
    const img = within(dialog).getByRole("img") as HTMLImageElement
    expect(img.src).toBe("https://res.cloudinary.com/demo/image/upload/f/b")
    expect(img.alt).toBe("Una tarde de lluvia")
  })

  it("shows the place name under the date, and not the coordinates", () => {
    const place = { lat: -34.59, lng: -58.42, name: "Palermo, Buenos Aires" }
    render(<MemoriesPlace state={ready(view("a", "Uno", { place }))} />)
    openGlass(/Uno/)
    const dialog = within(screen.getByRole("dialog"))
    expect(dialog.getByText("Palermo, Buenos Aires")).toBeTruthy()
    expect(screen.getByRole("dialog").textContent).not.toMatch(/34\.59|58\.42/)
  })

  it("says a pending memory is waiting for approval", () => {
    render(<MemoriesPlace state={ready(view("a", "Mío", { status: "pending" }))} />)
    openGlass(/Mío/)
    expect(within(screen.getByRole("dialog")).getByText("Pendiente de aprobación")).toBeTruthy()
  })

  it("holds the orb it flies to still, so it arrives where the glass opens", () => {
    render(<MemoriesPlace state={three} />)
    fireEvent.click(orbAt(/Una tarde de lluvia/))
    expect(orbAt(/Una tarde de lluvia/).getAttribute("data-link")).toBe("self")
    advanceUntil(dialogOpen)
    // The orb sits at the glass anchor: the middle of the screen, a little above the center.
    const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(transformOf(/Una tarde de lluvia/) ?? "")!
    expect(Number(m[1])).toBeCloseTo(window.innerWidth / 2, 0)
    expect(Number(m[2])).toBeGreaterThan(window.innerHeight * 0.3)
    expect(Number(m[2])).toBeLessThan(window.innerHeight * 0.6)
  })

  const lens = () => lensGeometry({ width: window.innerWidth, height: window.innerHeight }, window.devicePixelRatio || 1)
  const translateOf = (transform: string | undefined) => {
    const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0(?:px)?\)(?: scale\(([\d.]+)\))?/.exec(transform ?? "")!
    return { x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) }
  }

  for (const dpr of [1, 1.5]) {
    it(`lands the orb exactly on the sphere's center, on the device pixel grid (${dpr}x)`, () => {
      vi.stubGlobal("devicePixelRatio", dpr)
      render(<MemoriesPlace state={three} />)
      advance(20)
      fireEvent.click(orbAt(/Una tarde de lluvia/))
      advanceUntil(dialogOpen)
      const { center } = lens()
      const orb = translateOf(transformOf(/Una tarde de lluvia/))
      expect(Math.abs(orb.x - center.x)).toBeLessThan(0.01)
      expect(Math.abs(orb.y - center.y)).toBeLessThan(0.01)
    })
  }

  it("opens the sphere exactly over the disc the orb grew into: same center, same size, nothing scaled", () => {
    render(<MemoriesPlace state={three} />)
    fireEvent.click(orbAt(/Una tarde de lluvia/))
    advanceUntil(dialogOpen)
    const { center, diameter } = lens()
    const disc = translateOf((document.querySelector("[data-focus-disc]") as HTMLElement).style.transform)
    expect(disc.scale).toBeCloseTo(1, 4)
    expect(disc.x + diameter / 2).toBeCloseTo(center.x, 2)
    expect(disc.y + diameter / 2).toBeCloseTo(center.y, 2)
    const sphere = screen.getByRole("dialog").querySelector<HTMLElement>("[data-glass-sphere]")!
    expect(parseFloat(sphere.style.left)).toBeCloseTo(center.x - diameter / 2, 2)
    expect(parseFloat(sphere.style.top)).toBeCloseTo(center.y - diameter / 2, 2)
    expect(parseFloat(sphere.style.width)).toBeCloseTo(diameter, 2)
  })

  it("lets the glass melt back into the orb before the camera flies home", () => {
    render(<MemoriesPlace state={three} />)
    fireEvent.click(orbAt(/Una tarde de lluvia/))
    advanceUntil(dialogOpen)
    const opened = transformOf(/Una tarde de lluvia/)
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    // Frames shorter than the release: the camera has not moved, the disc is still the sphere.
    advance(1, GLASS_RELEASE_MS / 2 - 10)
    expect(transformOf(/Una tarde de lluvia/)).toBe(opened)
    advance(3)
    expect(transformOf(/Una tarde de lluvia/)).not.toBe(opened)
  })

  it("flies straight back when closed mid-flight, with no glass to wait for", () => {
    render(<MemoriesPlace state={three} />)
    fireEvent.click(orbAt(/Una tarde de lluvia/))
    advance(4)
    const mid = transformOf(/Una tarde de lluvia/)
    fireEvent.keyDown(stage(), { key: "Escape" })
    advance(1, 60)
    expect(transformOf(/Una tarde de lluvia/)).not.toBe(mid)
  })

  it("flies back with Escape, restores focus to the orb and ends idle", async () => {
    render(<MemoriesPlace state={three} />)
    openGlass(/Una tarde de lluvia/)
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(phase()).toBe("leaving")
    advanceUntil(() => phase() === "idle")
    expect(dialogOpen()).toBe(false)
    await waitFor(() => expect(document.activeElement).toBe(orbAt(/Una tarde de lluvia/)))
  })

  it("flies back with the close button too", () => {
    render(<MemoriesPlace state={three} />)
    openGlass(/primer viaje/)
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cerrar" }))
    expect(phase()).toBe("leaving")
    advanceUntil(() => phase() === "idle")
  })

  it("flies back when the visitor zooms out, and not when zooming in", () => {
    render(<MemoriesPlace state={three} />)
    openGlass(/Una tarde de lluvia/)
    const sphere = screen.getByRole("dialog").querySelector("[data-glass-sphere]")!
    fireEvent.wheel(sphere, { deltaY: -120 })
    expect(phase()).toBe("open")
    fireEvent.wheel(sphere, { deltaY: 120 })
    expect(phase()).toBe("leaving")
  })

  it("can be closed mid-flight, and the camera heads back", () => {
    render(<MemoriesPlace state={three} />)
    fireEvent.click(orbAt(/Una tarde de lluvia/))
    advance(3)
    fireEvent.keyDown(stage(), { key: "Escape" })
    expect(phase()).toBe("leaving")
    advanceUntil(() => phase() === "idle")
    expect(dialogOpen()).toBe(false)
  })

  it("takes the orbs out of the magnetic cursor's reach while the glass is open, and gives them back on close", () => {
    render(<MemoriesPlace state={three} />)
    const points = () => Array.from(document.querySelectorAll<HTMLElement>("[data-memory-id]"))
    // The cursor skips targets under an aria-hidden or inert ancestor, so the orbs behind the glass cannot capture it
    // or show their label over the dialog.
    const covered = (el: HTMLElement) => el.closest("[aria-hidden='true'],[inert]") !== null
    expect(points().some(covered)).toBe(false)
    openGlass(/Una tarde de lluvia/)
    expect(points()).toHaveLength(3)
    expect(points().every(covered)).toBe(true)
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    advanceUntil(() => phase() === "idle")
    expect(points().some(covered)).toBe(false)
  })

  it("does not pan or zoom the space while the glass is open", () => {
    render(<MemoriesPlace state={three} />)
    openGlass(/Una tarde de lluvia/)
    const before = transformOf(/El primer viaje/)
    fireEvent.keyDown(stage(), { key: "ArrowLeft" })
    fireEvent.wheel(stage(), { deltaY: -200 })
    expect(transformOf(/El primer viaje/)).toBe(before)
  })
})

describe("MemoriesPlace leaving a memory", () => {
  beforeEach(stubFrames)

  const glass = () => screen.getByRole("dialog")
  const orbs = () => Array.from(document.querySelectorAll<HTMLElement>("[data-memory-id]"))
  const scaleOf = (orb: HTMLElement) => /scale\(([\d.]+)\)/.exec(orb.parentElement?.style.transform ?? "")?.[1]
  const ways: Record<string, () => void> = {
    Escape: () => fireEvent.keyDown(glass(), { key: "Escape" }),
    "the close button": () => fireEvent.click(within(glass()).getByRole("button", { name: "Cerrar" })),
    "a wheel out": () => fireEvent.wheel(glass().querySelector("[data-glass-sphere]")!, { deltaY: 120 }),
  }

  for (const [way, close] of Object.entries(ways)) {
    it(`puts every orb back to its normal look after closing with ${way}`, async () => {
      render(<MemoriesPlace state={three} />)
      advance(2)
      const before = orbs().map(scaleOf)
      fireEvent.click(orbAt(/Una tarde de lluvia/))
      advanceUntil(dialogOpen)
      close()
      advanceUntil(() => phase() === "idle")
      // Focus goes back to the orb (for the keyboard), but it must not hold it: no orb lit, none dimmed.
      await waitFor(() => expect(document.activeElement).toBe(orbAt(/Una tarde de lluvia/)))
      advance(2)
      expect(orbs().map((o) => o.getAttribute("data-link"))).toEqual(["idle", "idle", "idle"])
      expect(orbs().some((o) => o.hasAttribute("data-focus"))).toBe(false)
      // The camera is back at its zoom, so every orb is drawn at the scale it had.
      expect(orbs().map(scaleOf)).toEqual(before)
      // The restored focus is a quiet one: no photo, no hold, until the visitor moves on.
      expect(orbAt(/Una tarde de lluvia/).getAttribute("data-quiet")).toBe("true")
    })
  }

  it("puts every orb back after a click on the empty stage closes it", async () => {
    render(<MemoriesPlace state={three} />)
    fireEvent.click(orbAt(/Una tarde de lluvia/))
    advanceUntil(dialogOpen)
    // Radix listens for outside presses from the next tick on.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    const scrim = document.querySelector(".mem-scrim")!
    fireEvent.pointerDown(scrim, { pointerType: "mouse", button: 0 })
    fireEvent.pointerUp(scrim, { pointerType: "mouse", button: 0 })
    fireEvent.click(scrim)
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(phase()).toBe("leaving")
    advanceUntil(() => phase() === "idle")
    await waitFor(() => expect(document.activeElement).toBe(orbAt(/Una tarde de lluvia/)))
    expect(orbs().map((o) => o.getAttribute("data-link"))).toEqual(["idle", "idle", "idle"])
  })

  it("keeps the constellation loop running after the glass closes", () => {
    render(<MemoriesPlace state={three} />)
    fireEvent.click(orbAt(/Una tarde de lluvia/))
    advanceUntil(dialogOpen)
    // While the glass is open the constellation idles under it: the orbs behind stay put.
    advance(1)
    const still = transformOf(/El primer viaje/)
    advance(4)
    expect(transformOf(/El primer viaje/)).toBe(still)
    fireEvent.keyDown(glass(), { key: "Escape" })
    advanceUntil(() => phase() === "idle")
    const at = transformOf(/El primer viaje/)
    advance(6)
    expect(frames.length).toBeGreaterThan(0)
    expect(transformOf(/El primer viaje/)).not.toBe(at)
  })

  it("holds an orb again once the visitor really moves focus to it", async () => {
    render(<MemoriesPlace state={three} />)
    fireEvent.click(orbAt(/Una tarde de lluvia/))
    advanceUntil(dialogOpen)
    fireEvent.keyDown(glass(), { key: "Escape" })
    advanceUntil(() => phase() === "idle")
    await waitFor(() => expect(document.activeElement).toBe(orbAt(/Una tarde de lluvia/)))
    act(() => orbAt(/El primer viaje/).focus())
    expect(orbAt(/El primer viaje/).getAttribute("data-link")).toBe("self")
    expect(orbAt(/Una tarde de lluvia/).hasAttribute("data-quiet")).toBe(false)
  })

  it("restores the camera exactly under reduced motion, whatever closed it", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    render(<MemoriesPlace state={three} />)
    const before = CAPTIONS.map((c) => transformOf(new RegExp(c)))
    for (const close of Object.values(ways)) {
      fireEvent.click(orbAt(/La casa nueva/))
      await waitFor(() => expect(dialogOpen()).toBe(true))
      close()
      await waitFor(() => expect(phase()).toBe("idle"))
      expect(CAPTIONS.map((c) => transformOf(new RegExp(c)))).toEqual(before)
      expect(orbs().every((o) => o.getAttribute("data-link") === "idle")).toBe(true)
    }
  })
})

const CAPTIONS = ["El primer viaje", "Una tarde de lluvia", "La casa nueva"]

describe("MemoriesPlace previous and next", () => {
  beforeEach(stubFrames)
  const glass = () => screen.getByRole("dialog")
  const open = (name: RegExp | string) => {
    fireEvent.click(orbAt(name))
    advanceUntil(dialogOpen)
  }
  /** Waits for the glass to be open on this caption (the camera flew to the neighbour). */
  const arriveAt = (caption: string) => advanceUntil(() => screen.queryByRole("dialog", { name: caption }) !== null)

  it("moves to the next and previous memory with the arrow keys, keeping the glass open on the way", () => {
    render(<MemoriesPlace state={three} />)
    open(/Una tarde de lluvia/)
    fireEvent.keyDown(glass(), { key: "ArrowRight" })
    expect(phase()).toBe("switching")
    // One motion: the sphere stays and the camera carries the world under it.
    expect(dialogOpen()).toBe(true)
    arriveAt("La casa nueva")
    // The caption changes half way across; the motion lands a moment later.
    advanceUntil(() => phase() === "open")
    fireEvent.keyDown(glass(), { key: "ArrowLeft" })
    arriveAt("Una tarde de lluvia")
    fireEvent.keyDown(glass(), { key: "ArrowLeft" })
    arriveAt("El primer viaje")
  })

  it("follows date order, not list order", () => {
    const list = ready(
      view("late", "Tarde", { happenedOn: "2024-09-01" }),
      view("early", "Temprano", { happenedOn: "2022-01-01" }),
      view("mid", "Medio", { happenedOn: "2023-05-05" }),
    )
    render(<MemoriesPlace state={list} />)
    open(/Medio/)
    fireEvent.keyDown(glass(), { key: "ArrowRight" })
    arriveAt("Tarde")
    fireEvent.keyDown(glass(), { key: "ArrowLeft" })
    arriveAt("Medio")
    fireEvent.keyDown(glass(), { key: "ArrowLeft" })
    arriveAt("Temprano")
  })

  it("stops at the ends instead of wrapping", () => {
    render(<MemoriesPlace state={three} />)
    open(/primer viaje/)
    fireEvent.keyDown(glass(), { key: "ArrowLeft" })
    expect(phase()).toBe("open")
    expect((within(glass()).getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("flies with the on-screen buttons too, and returns focus to the orb being viewed", async () => {
    render(<MemoriesPlace state={three} />)
    open(/primer viaje/)
    fireEvent.click(within(glass()).getByRole("button", { name: "Siguiente" }))
    arriveAt("Una tarde de lluvia")
    fireEvent.keyDown(glass(), { key: "Escape" })
    advanceUntil(() => phase() === "idle")
    await waitFor(() => expect(document.activeElement).toBe(orbAt(/Una tarde de lluvia/)))
  })

  it("returns to where the camera was before the first approach, however far it stepped", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    render(<MemoriesPlace state={three} />)
    const before = CAPTIONS.map((c) => transformOf(new RegExp(c)))
    fireEvent.click(orbAt(/El primer viaje/))
    return waitFor(() => expect(dialogOpen()).toBe(true)).then(async () => {
      fireEvent.keyDown(glass(), { key: "ArrowRight" })
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Una tarde de lluvia" })).not.toBeNull())
      fireEvent.keyDown(glass(), { key: "Escape" })
      await waitFor(() => expect(phase()).toBe("idle"))
      const after = CAPTIONS.map((c) => transformOf(new RegExp(c)))
      expect(after).toEqual(before)
    })
  })

  it("turns the page on a swipe", () => {
    render(<MemoriesPlace state={three} />)
    open(/Una tarde de lluvia/)
    const sphere = glass().querySelector("[data-glass-sphere]")!
    fireEvent.pointerDown(sphere, { pointerType: "touch", clientX: 300, clientY: 400 })
    fireEvent.pointerUp(sphere, { pointerType: "touch", clientX: 180, clientY: 410 })
    expect(phase()).toBe("switching")
    arriveAt("La casa nueva")
  })

  it("retargets rapid arrows as one motion: no stacking, it lands once on the last one, exactly centered", () => {
    const five = ready(...["a", "b", "c", "d", "e"].map((id, i) => view(id, `Recuerdo ${id}`, { happenedOn: `2024-03-1${i}` })))
    render(<MemoriesPlace state={five} />)
    open(/Recuerdo a/)
    const phases: string[] = []
    fireEvent.keyDown(glass(), { key: "ArrowRight" })
    for (let k = 0; k < 2; k++) {
      advance(1, 60)
      phases.push(phase()!)
      fireEvent.keyDown(glass(), { key: "ArrowRight" })
    }
    advanceUntil(() => phase() === "open")
    expect(phases.every((p) => p === "switching")).toBe(true)
    expect(screen.getByRole("dialog", { name: "Recuerdo d" })).toBeTruthy()
    const { center } = lensGeometry({ width: window.innerWidth, height: window.innerHeight }, window.devicePixelRatio || 1)
    const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(transformOf(/Recuerdo d/) ?? "")!
    expect(Math.abs(Number(m[1]) - center.x)).toBeLessThan(0.01)
    expect(Math.abs(Number(m[2]) - center.y)).toBeLessThan(0.01)
  })

  it("can be closed in the middle of a switch, and flies home", () => {
    render(<MemoriesPlace state={three} />)
    open(/Una tarde de lluvia/)
    fireEvent.keyDown(glass(), { key: "ArrowRight" })
    advance(2)
    fireEvent.keyDown(glass(), { key: "Escape" })
    expect(phase()).toBe("leaving")
    advanceUntil(() => phase() === "idle")
  })
})

describe("MemoriesPlace camera", () => {
  const reducedMotion = () =>
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))

  it("is a focusable space with its keys named", () => {
    render(<MemoriesPlace state={three} />)
    const space = stage()
    expect(space.getAttribute("role")).toBe("group")
    expect(space.getAttribute("aria-label")).toMatch(/Recuerdos/)
    expect(space.getAttribute("aria-label")).toMatch(/flechas/i)
    expect(space.tabIndex).toBe(0)
  })

  it("pans with the arrow keys while the space has focus", () => {
    reducedMotion()
    render(<MemoriesPlace state={three} />)
    const before = transformOf(/El primer viaje/)
    fireEvent.keyDown(stage(), { key: "ArrowLeft" })
    expect(transformOf(/El primer viaje/)).not.toBe(before)
  })

  it("keeps the title and the add control fixed while the camera moves", () => {
    reducedMotion()
    render(<MemoriesPlace state={three} action={<button type="button">Agregar recuerdo</button>} />)
    const title = screen.getByRole("heading", { name: "Recuerdos" })
    fireEvent.keyDown(stage(), { key: "ArrowLeft" })
    fireEvent.keyDown(stage(), { key: "+" })
    expect(title.style.transform).toBe("")
    expect(stage().querySelector("[data-world]")?.contains(title)).toBe(false)
    expect(stage().querySelector("[data-world]")?.contains(screen.getByRole("button", { name: "Agregar recuerdo" }))).toBe(false)
  })

  it("zooms with the wheel, toward the pointer", () => {
    reducedMotion()
    render(<MemoriesPlace state={three} />)
    const before = transformOf(/El primer viaje/)
    fireEvent.wheel(stage(), { deltaY: -240, clientX: 200, clientY: 200 })
    expect(transformOf(/El primer viaje/)).not.toBe(before)
  })

  it("fits everything again with 0", async () => {
    reducedMotion()
    render(<MemoriesPlace state={three} />)
    const before = transformOf(/El primer viaje/)
    fireEvent.keyDown(stage(), { key: "+" })
    fireEvent.keyDown(stage(), { key: "+" })
    expect(transformOf(/El primer viaje/)).not.toBe(before)
    fireEvent.keyDown(stage(), { key: "0" })
    // A fit is a camera move: under reduced motion it cuts, with a short fade.
    await waitFor(() => expect(transformOf(/El primer viaje/)).toBe(before))
  })

  it("gives the dust and the glows depth: the glow layers sit apart from the orbs", () => {
    render(<MemoriesPlace state={three} />)
    const layers = stage().querySelectorAll("[data-parallax]")
    expect(layers).toHaveLength(VOID_GLOWS.length)
  })

  it("moves the glows less than the camera moves, and in the same direction as the world drifts", () => {
    reducedMotion()
    render(<MemoriesPlace state={three} />)
    const layers = Array.from(stage().querySelectorAll<HTMLElement>("[data-parallax]"))
    fireEvent.keyDown(stage(), { key: "ArrowRight" })
    const x = (el: HTMLElement) => Number(/translate3d\((-?[\d.]+)px/.exec(el.style.transform)?.[1] ?? 0)
    // The camera moved right, so the world (and the glows) slide left, the nearer layer more.
    expect(x(layers[0])).toBeLessThan(0)
    expect(Math.abs(x(layers[2]))).toBeGreaterThan(Math.abs(x(layers[0])))
  })
})

describe("MemoriesPlace reduced motion", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
  })

  it("cuts to the orb with a short fade instead of flying, and opens the glass", async () => {
    render(<MemoriesPlace state={three} />)
    fireEvent.click(orbAt(/Una tarde de lluvia/))
    await waitFor(() => expect(dialogOpen()).toBe(true))
    expect(phase()).toBe("open")
  })

  it("switches memories with a plain crossfade: the glass stays, the camera cuts under it", async () => {
    render(<MemoriesPlace state={three} />)
    fireEvent.click(orbAt(/Una tarde de lluvia/))
    await waitFor(() => expect(dialogOpen()).toBe(true))
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" })
    expect(dialogOpen()).toBe(true)
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "La casa nueva" })).not.toBeNull())
    await waitFor(() => expect(phase()).toBe("open"))
  })

  it("fades the world out around the cut", async () => {
    render(<MemoriesPlace state={three} />)
    fireEvent.click(orbAt(/Una tarde de lluvia/))
    expect(stage().getAttribute("data-cut")).toBe("out")
    await waitFor(() => expect(dialogOpen()).toBe(true))
    await waitFor(() => expect(stage().hasAttribute("data-cut")).toBe(false))
  })

  it("has no inertia: a flick stops where it lets go", () => {
    render(<MemoriesPlace state={three} />)
    const before = transformOf(/El primer viaje/)
    fireEvent.pointerDown(stage(), { pointerType: "mouse", pointerId: 1, clientX: 500, clientY: 300, button: 0 })
    fireEvent.pointerMove(stage(), { pointerType: "mouse", pointerId: 1, clientX: 560, clientY: 300 })
    fireEvent.pointerUp(stage(), { pointerType: "mouse", pointerId: 1, clientX: 560, clientY: 300 })
    const moved = transformOf(/El primer viaje/)
    expect(moved).not.toBe(before)
    return new Promise((resolve) => setTimeout(resolve, 80)).then(() => {
      expect(transformOf(/El primer viaje/)).toBe(moved)
    })
  })
})

describe("MemoriesPlace action slot", () => {
  it("hands a function action the stage, so a dialog can mount inside it", () => {
    const seen: Array<HTMLElement | null> = []
    render(
      <MemoriesPlace
        state={ready()}
        action={(container) => {
          seen.push(container)
          return <button type="button">Agregar recuerdo</button>
        }}
      />,
    )
    const stage = screen.getByRole("heading", { name: "Recuerdos" }).parentElement
    expect(seen.at(-1)).toBe(stage)
    expect(stage?.contains(screen.getByRole("button", { name: "Agregar recuerdo" }))).toBe(true)
  })
})

describe("MemoriesPlace on touch", () => {
  const orbOf = (name: string) => screen.getByRole("button", { name: new RegExp(name) })

  it("stops an orb under the finger, so the tap lands on it instead of where it was drifting", async () => {
    render(<MemoriesPlace state={three} />)
    const orb = orbOf("El primer viaje")
    fireEvent.pointerOver(orb, { pointerType: "touch" })
    await waitFor(() => expect(orb.getAttribute("data-link")).toBe("self"))
  })

  it("lets it go again when the finger lifts", async () => {
    render(<MemoriesPlace state={three} />)
    const orb = orbOf("El primer viaje")
    fireEvent.pointerOver(orb, { pointerType: "touch" })
    await waitFor(() => expect(orb.getAttribute("data-link")).toBe("self"))
    fireEvent.pointerOut(orb, { pointerType: "touch", relatedTarget: document.body })
    await waitFor(() => expect(orb.getAttribute("data-link")).not.toBe("self"))
  })
})

describe("MemoriesPlace title", () => {
  // While the glass is open the stage is hidden from assistive tech, so find the heading by its tag.
  const title = () => document.querySelector<HTMLElement>("h1")!
  afterEach(() => vi.useRealTimers())

  it("arrives large, then shrinks into a small label by the way back after about two seconds", () => {
    vi.useFakeTimers()
    render(<MemoriesPlace state={three} />)
    expect(title().getAttribute("data-title")).toBe("hero")
    act(() => vi.advanceTimersByTime(TITLE_HOLD_MS - 50))
    expect(title().getAttribute("data-title")).toBe("hero")
    act(() => vi.advanceTimersByTime(100))
    expect(title().getAttribute("data-title")).toBe("label")
  })

  it("shrinks with a FLIP: the label starts where the large title was, at its size, on the interface's ease-out", () => {
    vi.useFakeTimers()
    const animate = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate })
    const boxes = {
      hero: new DOMRect(80, 740, 425, 88),
      label: new DOMRect(48, 68, 85, 24),
    }
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const mode = this.getAttribute("data-title") as "hero" | "label" | null
        return mode ? boxes[mode] : new DOMRect()
      })
    render(<MemoriesPlace state={three} />)
    act(() => vi.advanceTimersByTime(TITLE_HOLD_MS + 10))
    expect(animate).toHaveBeenCalledTimes(1)
    const [frames, options] = animate.mock.calls[0]
    expect(frames[0].transform).toBe("translate(32px, 672px) scale(5)")
    expect(frames[0].transformOrigin).toBe("0 0")
    expect(frames.at(-1).transform).toBe("none")
    expect(options).toMatchObject({ duration: TITLE_SHRINK_MS, easing: TITLE_EASE })
    rect.mockRestore()
    delete (HTMLElement.prototype as { animate?: unknown }).animate
  })

  it("crossfades into the label under reduced motion: no travel, no transform", () => {
    vi.useFakeTimers()
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    const animate = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate })
    render(<MemoriesPlace state={three} />)
    act(() => vi.advanceTimersByTime(TITLE_HOLD_MS + 10))
    expect(title().getAttribute("data-fading")).toBe("true")
    expect(title().getAttribute("data-title")).toBe("hero")
    act(() => vi.advanceTimersByTime(TITLE_FADE_OUT_MS + 10))
    expect(title().getAttribute("data-title")).toBe("label")
    expect(title().getAttribute("data-fading")).toBe("false")
    expect(animate).not.toHaveBeenCalled()
    expect(title().style.transform).toBe("")
    delete (HTMLElement.prototype as { animate?: unknown }).animate
  })

  describe("on a memory", () => {
    beforeEach(stubFrames)

    it("hides while the camera is on a memory, so it never meets the caption, and comes back as the label", () => {
      render(<MemoriesPlace state={three} />)
      expect(title().getAttribute("data-hidden")).toBe("false")
      fireEvent.click(orbAt(/Una tarde de lluvia/))
      expect(title().getAttribute("data-hidden")).toBe("true")
      advanceUntil(dialogOpen)
      expect(title().getAttribute("data-hidden")).toBe("true")
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
      expect(title().getAttribute("data-hidden")).toBe("false")
      // It went in before the hold was over: it comes back as the label, never as the large title.
      expect(title().getAttribute("data-title")).toBe("label")
    })

    it("stays hidden while the glass moves to another memory", () => {
      render(<MemoriesPlace state={three} />)
      fireEvent.click(orbAt(/Una tarde de lluvia/))
      advanceUntil(dialogOpen)
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" })
      expect(phase()).toBe("switching")
      expect(title().getAttribute("data-hidden")).toBe("true")
    })
  })
})

describe("MemoriesPlace as a guest (a shared memory)", () => {
  beforeEach(stubFrames)

  const shared = view("s", "Una tarde compartida")

  it("opens that one memory in the glass by itself, with no click", () => {
    render(<MemoriesPlace state={ready(shared)} guest={{ memoryId: "s", onExit: vi.fn() }} />)
    advanceUntil(dialogOpen)
    expect(phase()).toBe("open")
    expect(screen.getByRole("dialog", { name: "Una tarde compartida" })).toBeTruthy()
  })

  it("opens it once, not again after it was left", () => {
    const onExit = vi.fn()
    render(<MemoriesPlace state={ready(shared)} guest={{ memoryId: "s", onExit }} />)
    advanceUntil(dialogOpen)
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    advance(30)
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(phase()).toBe("open")
  })

  it("exits on Esc, on Cerrar and on Universo, and never flies the camera back", () => {
    for (const leave of [
      () => fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" }),
      () => fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cerrar" })),
      () => fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Universo/ })),
    ]) {
      const onExit = vi.fn()
      const { unmount } = render(<MemoriesPlace state={ready(shared)} guest={{ memoryId: "s", onExit }} />)
      advanceUntil(dialogOpen)
      leave()
      expect(onExit).toHaveBeenCalledTimes(1)
      expect(phase()).toBe("open")
      unmount()
    }
  })

  it("exits on Esc from the stage too", () => {
    const onExit = vi.fn()
    render(<MemoriesPlace state={ready(shared)} guest={{ memoryId: "s", onExit }} />)
    fireEvent.keyDown(stage(), { key: "Escape" })
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it("shows no previous or next, and no add control or other memory", () => {
    render(<MemoriesPlace state={ready(shared)} guest={{ memoryId: "s", onExit: vi.fn() }} />)
    advanceUntil(dialogOpen)
    const dialog = within(screen.getByRole("dialog"))
    expect(dialog.queryByRole("button", { name: "Anterior" })).toBeNull()
    expect(dialog.queryByRole("button", { name: "Siguiente" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Agregar recuerdo", hidden: true })).toBeNull()
  })

  it("under reduced motion it cuts to the memory and opens it", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    render(<MemoriesPlace state={ready(shared)} guest={{ memoryId: "s", onExit: vi.fn() }} />)
    await waitFor(() => expect(dialogOpen()).toBe(true))
  })

  it("does not open a memory that is not in the list", () => {
    render(<MemoriesPlace state={ready(shared)} guest={{ memoryId: "other", onExit: vi.fn() }} />)
    advance(30)
    expect(phase()).toBe("idle")
  })
})
