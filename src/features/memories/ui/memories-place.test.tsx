import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import { rimColor } from "../orb-color"
import { MemoriesPlace, type MemoriesState } from "./memories-place"
import { VOID_GLOWS } from "./void-glows"

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

describe("MemoriesPlace viewer", () => {
  const open = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }))

  it("opens the photo, caption and date when a point is clicked", () => {
    render(<MemoriesPlace state={three} />)
    open(/Una tarde de lluvia/)
    const dialog = screen.getByRole("dialog", { name: "Una tarde de lluvia" })
    expect(within(dialog).getByText("12 de marzo de 2024")).toBeTruthy()
    const img = within(dialog).getByRole("img") as HTMLImageElement
    expect(img.src).toBe("https://res.cloudinary.com/demo/image/upload/f/b")
    expect(img.alt).toBe("Una tarde de lluvia")
  })

  it("reserves the photo's aspect ratio so nothing jumps when it loads", () => {
    render(<MemoriesPlace state={ready(view("a", "Uno", { width: 1200, height: 800 }))} />)
    open(/Uno/)
    const frame = screen.getByRole("dialog").querySelector("[data-photo-frame]") as HTMLElement
    expect(frame.style.aspectRatio).toBe("1200 / 800")
  })

  it("shows the place name under the date, small and quiet, when the memory has one", () => {
    const place = { lat: -34.59, lng: -58.42, name: "Palermo, Buenos Aires" }
    render(<MemoriesPlace state={ready(view("a", "Uno", { place }))} />)
    open(/Uno/)
    const dialog = within(screen.getByRole("dialog"))
    const date = dialog.getByText("12 de marzo de 2024")
    const name = dialog.getByText("Palermo, Buenos Aires")
    expect(date.nextElementSibling).toBe(name)
    // The coordinates are not shown: only the name.
    expect(screen.getByRole("dialog").textContent).not.toMatch(/34\.59|58\.42/)
  })

  it("shows no place line when there is no place, or the place has no name", () => {
    render(
      <MemoriesPlace
        state={ready(view("a", "Uno"), view("b", "Dos", { place: { lat: -34.59, lng: -58.42, name: null } }))}
      />,
    )
    for (const caption of [/Uno/, /Dos/]) {
      open(caption)
      const date = within(screen.getByRole("dialog")).getByText("12 de marzo de 2024")
      expect(date.nextElementSibling).toBeNull()
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    }
  })

  it("says a pending memory is waiting for approval", () => {
    render(<MemoriesPlace state={ready(view("a", "Mío", { status: "pending" }))} />)
    open(/Mío/)
    expect(within(screen.getByRole("dialog")).getByText("Pendiente de aprobación")).toBeTruthy()
  })

  it("closes with Escape and returns focus to the point", async () => {
    render(<MemoriesPlace state={three} />)
    const point = screen.getByRole("button", { name: /Una tarde de lluvia/ })
    point.focus()
    fireEvent.click(point)
    expect(screen.getByRole("dialog")).toBeTruthy()
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    // The dialog hands focus back on the next tick.
    await waitFor(() => expect(document.activeElement).toBe(point))
  })

  it("takes the points out of the magnetic cursor's reach while the viewer is open, and gives them back on close", async () => {
    render(<MemoriesPlace state={three} />)
    const points = () => Array.from(document.querySelectorAll<HTMLElement>("[data-memory-id]"))
    // The cursor skips targets under an aria-hidden or inert ancestor, so the orbs behind the viewer cannot
    // capture it or show their label over the dialog.
    const covered = (el: HTMLElement) => el.closest("[aria-hidden='true'],[inert]") !== null
    expect(points().some(covered)).toBe(false)
    open(/Una tarde de lluvia/)
    expect(points()).toHaveLength(3)
    expect(points().every(covered)).toBe(true)
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    await waitFor(() => expect(points().some(covered)).toBe(false))
  })

  it("closes with the close button", () => {
    render(<MemoriesPlace state={three} />)
    open(/primer viaje/)
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cerrar" }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("moves to the next and previous memory with the arrow keys", () => {
    render(<MemoriesPlace state={three} />)
    open(/Una tarde de lluvia/)
    const dialog = () => screen.getByRole("dialog")
    fireEvent.keyDown(dialog(), { key: "ArrowRight" })
    expect(within(dialog()).getByText("La casa nueva")).toBeTruthy()
    fireEvent.keyDown(dialog(), { key: "ArrowLeft" })
    fireEvent.keyDown(dialog(), { key: "ArrowLeft" })
    expect(within(dialog()).getByText("El primer viaje")).toBeTruthy()
  })

  it("stops at the ends instead of wrapping", () => {
    render(<MemoriesPlace state={three} />)
    open(/primer viaje/)
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" })
    const dialog = within(screen.getByRole("dialog"))
    expect(dialog.getByText("El primer viaje")).toBeTruthy()
    expect((dialog.getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("navigates with the on-screen buttons too, and returns focus to the point being viewed", async () => {
    render(<MemoriesPlace state={three} />)
    open(/primer viaje/)
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Siguiente" }))
    expect(within(screen.getByRole("dialog")).getByText("Una tarde de lluvia")).toBeTruthy()
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /Una tarde de lluvia/ })),
    )
  })
})

describe("MemoriesPlace viewer swipe", () => {
  const swipe = (target: Element, from: number, to: number) => {
    fireEvent.pointerDown(target, { pointerType: "touch", clientX: from, clientY: 400 })
    fireEvent.pointerUp(target, { pointerType: "touch", clientX: to, clientY: 410 })
  }

  it("moves to the next memory on a swipe to the left and back on a swipe to the right", () => {
    render(<MemoriesPlace state={three} />)
    fireEvent.click(screen.getByRole("button", { name: /Una tarde de lluvia/ }))
    const frame = () => screen.getByRole("dialog").querySelector("[data-photo-frame]") as HTMLElement
    swipe(frame(), 300, 180)
    expect(within(screen.getByRole("dialog")).getByText("La casa nueva")).toBeTruthy()
    swipe(frame(), 100, 240)
    expect(within(screen.getByRole("dialog")).getByText("Una tarde de lluvia")).toBeTruthy()
  })

  it("does nothing on a tap, and stays on the first memory when swiping right", () => {
    render(<MemoriesPlace state={three} />)
    fireEvent.click(screen.getByRole("button", { name: /El primer viaje/ }))
    const frame = screen.getByRole("dialog").querySelector("[data-photo-frame]") as HTMLElement
    swipe(frame, 200, 205)
    swipe(frame, 100, 240)
    expect(within(screen.getByRole("dialog")).getByText("El primer viaje")).toBeTruthy()
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
