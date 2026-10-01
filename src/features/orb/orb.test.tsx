import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Rect } from "./orb-path"
import { Orb, type OrbProps } from "./orb"

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const keepOut = (): Rect[] => [{ left: 0, top: 0, right: 240, bottom: 96 }]

function setup(props: Partial<OrbProps> = {}) {
  const orb = vi.fn()
  const sky = { current: { orb, pulse: vi.fn(), aim: vi.fn(), focus: vi.fn() } }
  const onOpen = vi.fn()
  const view = render(
    <div style={{ width: 1024, height: 768 }}>
      <Orb active interactive held={false} sky={sky} keepOut={keepOut} onOpen={onOpen} {...props} />
    </div>,
  )
  return { orb, onOpen, view, sky }
}

describe("Orb", () => {
  it("is a real button named Agregar recuerdo", () => {
    setup()
    const button = screen.getByRole("button", { name: "Agregar recuerdo" })
    expect(button.tagName).toBe("BUTTON")
    expect(button.getAttribute("type")).toBe("button")
  })

  it("is a magnetic target that carries its label and Ctrl context", () => {
    setup()
    const button = screen.getByRole("button", { name: "Agregar recuerdo" })
    expect(button.dataset.magnetic).toBe("strong")
    expect(button.dataset.cursorId).toBe("memory-orb")
    expect(button.dataset.cursorLabel).toBe("Agregar recuerdo")
    expect(button.dataset.cursorContext).toBe("Deja un recuerdo en este universo. Pulsa R para llamarlo.")
  })

  it("can be reached by keyboard", () => {
    setup()
    const button = screen.getByRole("button", { name: "Agregar recuerdo" })
    expect(button.tabIndex).toBeGreaterThanOrEqual(0)
    button.focus()
    expect(document.activeElement).toBe(button)
  })

  it("opens on click, reporting where the orb was in sky coordinates (y up)", async () => {
    const { onOpen } = setup()
    await act(() => vi.advanceTimersByTimeAsync(100))
    fireEvent.click(screen.getByRole("button", { name: "Agregar recuerdo" }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    const { x, y } = onOpen.mock.calls[0][0]
    expect(x).toBeGreaterThan(0)
    expect(x).toBeLessThan(1)
    expect(y).toBeGreaterThan(0)
    expect(y).toBeLessThan(1)
  })

  it("is not rendered when it is not interactive, though the glow can still be shown", async () => {
    const { orb } = setup({ interactive: false })
    expect(screen.queryByRole("button", { name: "Agregar recuerdo" })).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(100))
    expect(orb).toHaveBeenCalled()
    expect(orb.mock.calls.at(-1)![0]).not.toBeNull()
  })

  it("feeds the sky the glow every frame: position, radius, energy, colour in gamut", async () => {
    const { orb } = setup()
    await act(() => vi.advanceTimersByTimeAsync(2000))
    const glow = orb.mock.calls.at(-1)![0]
    expect(glow.radius).toBeGreaterThan(20)
    expect(glow.energy).toBeGreaterThan(0.5)
    expect(glow.fringe).toBeGreaterThan(0)
    glow.color.forEach((v: number) => expect(v >= 0 && v <= 1).toBe(true))
    expect(glow.x).toBeGreaterThan(0)
    expect(glow.x).toBeLessThan(1024)
  })

  it("stops moving while held and keeps its place", async () => {
    const { orb, view, sky, onOpen } = setup()
    await act(() => vi.advanceTimersByTimeAsync(3000))
    view.rerender(
      <div style={{ width: 1024, height: 768 }}>
        <Orb active interactive held sky={sky} keepOut={keepOut} onOpen={onOpen} />
      </div>,
    )
    await act(() => vi.advanceTimersByTimeAsync(4000))
    const a = orb.mock.calls.at(-1)![0]
    await act(() => vi.advanceTimersByTimeAsync(1000))
    const b = orb.mock.calls.at(-1)![0]
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1)
  })

  it("clears the glow and the loop when it unmounts", async () => {
    const { orb, view } = setup()
    await act(() => vi.advanceTimersByTimeAsync(100))
    view.unmount()
    expect(orb.mock.calls.at(-1)![0]).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("repaints on a slow clock under reduced motion instead of a frame loop", async () => {
    vi.stubGlobal(
      "matchMedia",
      (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }),
    )
    const { orb } = setup()
    await act(() => vi.advanceTimersByTimeAsync(1000))
    const calls = orb.mock.calls.length
    expect(calls).toBeGreaterThan(2)
    expect(calls).toBeLessThan(25)
  })

  describe("the peek", () => {
    const rerender = (view: ReturnType<typeof setup>["view"], sky: ReturnType<typeof setup>["sky"], over: Partial<OrbProps>) =>
      view.rerender(
        <div style={{ width: 1024, height: 768 }}>
          <Orb active interactive held={false} sky={sky} keepOut={keepOut} onOpen={vi.fn()} {...over} />
        </div>,
      )
    const last = (orb: ReturnType<typeof setup>["orb"]) => orb.mock.calls.at(-1)![0]
    const mover = () => screen.getByRole("button", { name: "Agregar recuerdo" }).parentElement as HTMLElement

    it("floats as a plain glow: no peek, the lens is the glow's own size, the button unscaled", async () => {
      const { orb } = setup()
      await act(() => vi.advanceTimersByTimeAsync(1500))
      const glow = last(orb)
      expect(glow.peek).toBe(0)
      expect(glow.lens).toBeGreaterThan(20)
      expect(glow.lens).toBeLessThan(glow.radius)
      expect(mover().style.getPropertyValue("--orb-zoom")).toBe("1.000")
    })

    it("grows into the window while the cursor holds it, and the button grows with it", async () => {
      const { orb, view, sky } = setup()
      await act(() => vi.advanceTimersByTimeAsync(1500))
      const rest = last(orb)
      rerender(view, sky, { held: true })
      await act(() => vi.advanceTimersByTimeAsync(600))
      const glow = last(orb)
      expect(glow.peek).toBeGreaterThan(0.97)
      expect(glow.lens).toBeGreaterThan(rest.lens * 1.5)
      expect(Number(mover().style.getPropertyValue("--orb-zoom"))).toBeGreaterThan(1.5)
    })

    it("also peeks on pointer hover and on keyboard focus, and goes back on leave and blur", async () => {
      const { orb } = setup()
      await act(() => vi.advanceTimersByTimeAsync(1500))
      const button = screen.getByRole("button", { name: "Agregar recuerdo" })
      fireEvent.mouseEnter(button)
      await act(() => vi.advanceTimersByTimeAsync(600))
      expect(last(orb).peek).toBeGreaterThan(0.97)
      fireEvent.mouseLeave(button)
      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(last(orb).peek).toBe(0)
      fireEvent.focus(button)
      await act(() => vi.advanceTimersByTimeAsync(600))
      expect(last(orb).peek).toBeGreaterThan(0.97)
      fireEvent.blur(button)
      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(last(orb).peek).toBe(0)
    })

    it("forgets a hover or focus that ended while the button was gone (the trip through the portal)", async () => {
      const { orb, view, sky } = setup()
      await act(() => vi.advanceTimersByTimeAsync(1500))
      const button = screen.getByRole("button", { name: "Agregar recuerdo" })
      fireEvent.mouseEnter(button)
      fireEvent.focus(button)
      await act(() => vi.advanceTimersByTimeAsync(600))
      expect(last(orb).peek).toBeGreaterThan(0.97)
      // The portal opens: the button is removed with no mouseleave or blur, then it comes back on the sky.
      rerender(view, sky, { interactive: false })
      await act(() => vi.advanceTimersByTimeAsync(100))
      rerender(view, sky, { interactive: true })
      await act(() => vi.advanceTimersByTimeAsync(1200))
      expect(last(orb).peek).toBe(0)
      expect(last(orb).rate ?? 1).toBeGreaterThan(0)
    })

    it("does not peek when it is only parked for a trip", async () => {
      const { orb, view, sky } = setup()
      await act(() => vi.advanceTimersByTimeAsync(1500))
      rerender(view, sky, { parked: true })
      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(last(orb).peek).toBe(0)
    })

    it("under reduced motion crossfades to the preview without scaling the button", async () => {
      vi.stubGlobal(
        "matchMedia",
        (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }),
      )
      const { orb, view, sky } = setup()
      await act(() => vi.advanceTimersByTimeAsync(1500))
      const rest = last(orb)
      rerender(view, sky, { held: true })
      await act(() => vi.advanceTimersByTimeAsync(1500))
      const glow = last(orb)
      expect(glow.peek).toBe(1)
      expect(glow.lens).toBeCloseTo(rest.lens, 3)
      expect(mover().style.getPropertyValue("--orb-zoom")).toBe("1.000")
    })
  })

  describe("summoning with R", () => {
    const last = (orb: ReturnType<typeof setup>["orb"]) => orb.mock.calls.at(-1)![0]
    const move = (x: number, y: number) => fireEvent.pointerMove(window, { clientX: x, clientY: y })
    const press = (init: KeyboardEventInit = {}, target: Window | Element = window) =>
      fireEvent.keyDown(target, { key: "r", ...init })
    const near = (glow: { x: number; y: number }, x: number, y: number) => Math.hypot(glow.x - x, glow.y - y)

    it("brings the orb next to the cursor and reports it once", async () => {
      const onSummon = vi.fn()
      const { orb } = setup({ onSummon })
      await act(() => vi.advanceTimersByTimeAsync(1500))
      move(700, 500)
      press()
      expect(onSummon).toHaveBeenCalledTimes(1)
      await act(() => vi.advanceTimersByTimeAsync(2500))
      const glow = last(orb)
      // Next to the cursor (its radius plus the gap), toward the middle of the screen: never under it.
      expect(near(glow, 700, 500)).toBeGreaterThan(glow.radius)
      expect(near(glow, 700, 500)).toBeLessThan(glow.radius + 40)
    })

    it("takes R as well as r, and R again while it is parked reports again", async () => {
      const onSummon = vi.fn()
      setup({ onSummon })
      await act(() => vi.advanceTimersByTimeAsync(500))
      press({ key: "R" })
      await act(() => vi.advanceTimersByTimeAsync(2500))
      press()
      expect(onSummon).toHaveBeenCalledTimes(2)
    })

    it("flies: it is neither already there on the first frame nor jumping", async () => {
      const { orb } = setup()
      await act(() => vi.advanceTimersByTimeAsync(1500))
      const before = last(orb)
      move(800, 600)
      press()
      await act(() => vi.advanceTimersByTimeAsync(100))
      const early = last(orb)
      expect(Math.hypot(early.x - before.x, early.y - before.y)).toBeLessThan(20)
      await act(() => vi.advanceTimersByTimeAsync(2500))
      expect(near(last(orb), 800, 600)).toBeLessThan(80)
    })

    it("lands in the middle of the screen when there is no pointer yet", async () => {
      const { orb } = setup()
      await act(() => vi.advanceTimersByTimeAsync(500))
      press()
      await act(() => vi.advanceTimersByTimeAsync(2500))
      expect(near(last(orb), 512, 384)).toBeLessThan(80)
    })

    it("ignores other keys, modifiers and a key held down", async () => {
      const onSummon = vi.fn()
      setup({ onSummon })
      press({ key: "e" })
      press({ ctrlKey: true })
      press({ metaKey: true })
      press({ altKey: true })
      press({ repeat: true })
      expect(onSummon).not.toHaveBeenCalled()
    })

    it("ignores it while typing in a field", async () => {
      const onSummon = vi.fn()
      setup({ onSummon })
      const input = document.createElement("input")
      document.body.appendChild(input)
      input.focus()
      press({}, input)
      input.remove()
      expect(onSummon).not.toHaveBeenCalled()
    })

    it("ignores it while a dialog is open", async () => {
      const onSummon = vi.fn()
      setup({ onSummon })
      const dialog = document.createElement("div")
      dialog.setAttribute("role", "dialog")
      document.body.appendChild(dialog)
      press()
      dialog.remove()
      expect(onSummon).not.toHaveBeenCalled()
    })

    it("ignores it when the orb is not on the sky (not interactive, or not active)", async () => {
      const onSummon = vi.fn()
      const { view } = setup({ onSummon, interactive: false })
      press()
      view.unmount()
      setup({ onSummon, active: false })
      press()
      expect(onSummon).not.toHaveBeenCalled()
    })

    it("stops listening when it unmounts", async () => {
      const onSummon = vi.fn()
      const { view } = setup({ onSummon })
      view.unmount()
      press()
      expect(onSummon).not.toHaveBeenCalled()
    })

    it("drops the summoned state when the sky is left, so it is not stale when it comes back", async () => {
      const { orb, view, sky } = setup()
      await act(() => vi.advanceTimersByTimeAsync(500))
      move(800, 600)
      press()
      await act(() => vi.advanceTimersByTimeAsync(2500))
      view.rerender(
        <div style={{ width: 1024, height: 768 }}>
          <Orb active interactive={false} held sky={sky} keepOut={keepOut} onOpen={vi.fn()} />
        </div>,
      )
      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(near(last(orb), 800, 600)).toBeLessThan(80)
      view.rerender(
        <div style={{ width: 1024, height: 768 }}>
          <Orb active interactive held={false} sky={sky} keepOut={keepOut} onOpen={vi.fn()} />
        </div>,
      )
      await act(() => vi.advanceTimersByTimeAsync(30000))
      const a = last(orb)
      await act(() => vi.advanceTimersByTimeAsync(1000))
      const b = last(orb)
      // Back on its wander: it moves again, a little each second.
      expect(near(a, b.x, b.y)).toBeGreaterThan(0)
      expect(near(a, b.x, b.y)).toBeLessThan(60)
    })

    it("under reduced motion does not fly: it fades and reappears next to the cursor", async () => {
      vi.stubGlobal(
        "matchMedia",
        (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }),
      )
      const { orb } = setup()
      await act(() => vi.advanceTimersByTimeAsync(1000))
      move(700, 500)
      press()
      const seen: { x: number; y: number; energy: number }[] = []
      for (let i = 0; i < 12; i++) {
        await act(() => vi.advanceTimersByTimeAsync(250))
        const glow = orb.mock.calls.map((c) => c[0]).filter(Boolean).at(-1)
        if (glow) seen.push(glow)
      }
      // Whenever it is clearly visible it is at the start or at the landing, never in between.
      const start = seen[0]
      for (const g of seen.filter((g) => g.energy > 0.2)) {
        expect(near(g, 700, 500) < 80 || near(g, start.x, start.y) < 60).toBe(true)
      }
      expect(near(last(orb), 700, 500)).toBeLessThan(80)
    })
  })
})

describe("Orb on touch", () => {
  it("is named on screen for visitors who cannot hover, and hidden for those who can", () => {
    const { view } = setup()
    const tag = view.container.querySelector("[data-orb-tag]") as HTMLElement
    expect(tag.textContent).toBe("Agregar recuerdo")
    // The button already carries the name for assistive tech; the visible copy is not read twice.
    expect(tag.getAttribute("aria-hidden")).toBe("true")
    expect(tag.className).toContain("[@media(hover:hover)_and_(pointer:fine)]:hidden")
    expect(tag.className).toContain("pointer-events-none")
  })

  it("moves the tag to the side with room as the orb wanders", async () => {
    const { view } = setup()
    await act(() => vi.advanceTimersByTimeAsync(100))
    const mover = view.container.querySelector("[data-orb-tag]")?.parentElement as HTMLElement
    expect(["left", "right"]).toContain(mover.dataset.side)
  })

  it("has no tag while the orb is not on the sky", () => {
    const { view } = setup({ interactive: false })
    expect(view.container.querySelector("[data-orb-tag]")).toBeNull()
  })
})
