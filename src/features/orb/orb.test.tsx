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
    expect(button.dataset.cursorContext).toBe("Deja un recuerdo en este universo.")
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
})
