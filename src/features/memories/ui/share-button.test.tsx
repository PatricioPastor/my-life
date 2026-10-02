import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryView } from "../memory-view"
import type { ShareMemoryResult } from "../share/share-view"
import { ShareButton } from "./share-button"

const track = vi.fn()
vi.mock("@/shared/analytics", () => ({ track: (...args: unknown[]) => track(...args) }))

const memory: MemoryView = {
  id: "11111111-1111-4111-8111-111111111111",
  caption: "Una tarde de lluvia",
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
  relatedId: null,
  thumbUrl: "https://res.cloudinary.com/demo/t",
  fullUrl: "https://res.cloudinary.com/demo/f",
  audio: null,
}
const URL_SHARED = "https://example.com/m/abc.def"
const asks = (answer: () => Promise<ShareMemoryResult>) => vi.fn<(id: string) => Promise<ShareMemoryResult>>(answer)
const okShare = () => asks(async () => ({ ok: true, url: URL_SHARED }))

let writeText: ReturnType<typeof vi.fn>
let webShare: ReturnType<typeof vi.fn>

/** A phone: a coarse pointer, and `navigator.share`. */
function onPhone(share: (data: ShareData) => Promise<void> = async () => undefined) {
  webShare = vi.fn(share)
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("coarse"), addEventListener: () => {}, removeEventListener: () => {} }))
  vi.stubGlobal("navigator", { ...navigator, share: webShare, clipboard: { writeText } })
}
/** A desktop: a fine pointer, with a clipboard, and a `navigator.share` that must be left alone. */
function onDesktop(withShare = true) {
  webShare = vi.fn(async () => undefined)
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
  vi.stubGlobal("navigator", { ...navigator, ...(withShare ? { share: webShare } : { share: undefined }), clipboard: { writeText } })
}

beforeEach(() => {
  track.mockReset()
  writeText = vi.fn(async () => undefined)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const click = async (share = okShare(), m: MemoryView = memory) => {
  render(<ShareButton memory={m} share={share} />)
  // The link was asked for when the button appeared and has arrived by the time anyone presses it.
  await act(async () => {})
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Compartir" }))
  })
  return share
}

describe("ShareButton", () => {
  it("is a magnetic, keyboard-reachable button called Compartir", () => {
    onDesktop()
    render(<ShareButton memory={memory} share={okShare()} />)
    const button = screen.getByRole("button", { name: "Compartir" })
    expect(button.getAttribute("data-magnetic")).toBe("light")
    expect(button.getAttribute("type")).toBe("button")
    expect(button.tabIndex).toBe(0)
  })

  it("is not shown for a pending memory: only approved ones can be shared", () => {
    onDesktop()
    render(<ShareButton memory={{ ...memory, status: "pending" }} share={okShare()} />)
    expect(screen.queryByRole("button", { name: "Compartir" })).toBeNull()
  })

  it("asks the server for the link of that memory", async () => {
    onDesktop()
    const share = await click()
    expect(share).toHaveBeenCalledWith(memory.id)
  })

  describe("on a phone, with Web Share", () => {
    it("opens the share sheet with the title, a neutral line and the url", async () => {
      onPhone()
      await click()
      expect(webShare).toHaveBeenCalledWith({ title: "Una tarde de lluvia", text: "Un recuerdo de patriciopastor", url: URL_SHARED })
      expect(writeText).not.toHaveBeenCalled()
    })

    it("tracks memory_shared, with no props, once it was shared", async () => {
      onPhone()
      await click()
      expect(track).toHaveBeenCalledTimes(1)
      expect(track).toHaveBeenCalledWith("memory_shared")
    })

    it("is silent when the visitor cancels the sheet: no message, no copy, no event", async () => {
      onPhone(async () => {
        throw new DOMException("cancelled", "AbortError")
      })
      await click()
      expect(writeText).not.toHaveBeenCalled()
      expect(track).not.toHaveBeenCalled()
      expect(screen.getByRole("status").textContent).toBe("")
    })

    it("falls back to copying the link when the sheet fails for another reason", async () => {
      onPhone(async () => {
        throw new DOMException("no activation", "NotAllowedError")
      })
      await click()
      expect(writeText).toHaveBeenCalledWith(URL_SHARED)
      expect(screen.getByRole("status").textContent).toBe("Enlace copiado")
    })
  })

  describe("on a desktop, or without Web Share", () => {
    it("copies the link and says so quietly", async () => {
      onDesktop()
      await click()
      expect(writeText).toHaveBeenCalledWith(URL_SHARED)
      expect(webShare).not.toHaveBeenCalled()
      expect(screen.getByRole("status").textContent).toBe("Enlace copiado")
      expect(track).toHaveBeenCalledWith("memory_shared")
    })

    it("copies on a phone that has no Web Share", async () => {
      onDesktop(false)
      vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("coarse"), addEventListener: () => {}, removeEventListener: () => {} }))
      await click()
      expect(writeText).toHaveBeenCalledWith(URL_SHARED)
    })

    it("lets the message go after about 2 seconds", async () => {
      onDesktop()
      vi.useFakeTimers()
      render(<ShareButton memory={memory} share={okShare()} />)
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Compartir" }))
      })
      expect(screen.getByRole("status").textContent).toBe("Enlace copiado")
      act(() => void vi.advanceTimersByTime(1900))
      expect(screen.getByRole("status").textContent).toBe("Enlace copiado")
      act(() => void vi.advanceTimersByTime(200))
      expect(screen.getByRole("status").textContent).toBe("")
    })

    it("says calmly when the link cannot be copied, and does not track a share", async () => {
      onDesktop()
      writeText.mockRejectedValue(new Error("denied"))
      await click()
      expect(screen.getByRole("status").textContent).toBe("No pudimos copiar el enlace")
      expect(track).not.toHaveBeenCalled()
    })
  })

  it("says calmly when the server has no link, and shares nothing", async () => {
    onDesktop()
    await click(asks(async () => ({ ok: false, reason: "not_shareable" })))
    expect(screen.getByRole("status").textContent).toBe("No pudimos crear el enlace")
    expect(writeText).not.toHaveBeenCalled()
    expect(track).not.toHaveBeenCalled()
  })

  it("says the same when the request itself fails", async () => {
    onDesktop()
    await click(asks(() => Promise.reject(new Error("offline"))))
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("No pudimos crear el enlace"))
  })

  it("ignores a second press while the first is still being answered", async () => {
    onDesktop()
    let resolve: (value: { ok: true; url: string }) => void = () => {}
    const share = asks(() => new Promise<ShareMemoryResult>((r) => (resolve = r as typeof resolve)))
    render(<ShareButton memory={memory} share={share} />)
    const button = screen.getByRole("button", { name: "Compartir" })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(share).toHaveBeenCalledTimes(1)
    expect(button.getAttribute("aria-busy")).toBe("true")
    await act(async () => resolve({ ok: true, url: URL_SHARED }))
    expect(button.getAttribute("aria-busy")).toBeNull()
  })

  describe("prefetching the link, to keep the user gesture", () => {
    it("asks for the link when it appears, once per memory, however often it renders", async () => {
      onPhone()
      const share = okShare()
      const { rerender } = render(<ShareButton memory={memory} share={share} />)
      rerender(<ShareButton memory={memory} share={share} />)
      await act(async () => {})
      expect(share).toHaveBeenCalledTimes(1)
      expect(share).toHaveBeenCalledWith(memory.id)
    })

    it("never asks for a pending memory", async () => {
      onPhone()
      const share = okShare()
      render(<ShareButton memory={{ ...memory, status: "pending" }} share={share} />)
      await act(async () => {})
      expect(share).not.toHaveBeenCalled()
    })

    it("opens the share sheet inside the click itself when the link is cached: no await in between", async () => {
      onPhone()
      const share = okShare()
      render(<ShareButton memory={memory} share={share} />)
      await act(async () => {})
      fireEvent.click(screen.getByRole("button", { name: "Compartir" }))
      // Nothing was awaited since the click: the sheet is already open.
      expect(webShare).toHaveBeenCalledWith({ title: "Una tarde de lluvia", text: "Un recuerdo de patriciopastor", url: URL_SHARED })
      expect(share).toHaveBeenCalledTimes(1)
      await act(async () => {})
      expect(track).toHaveBeenCalledWith("memory_shared")
    })

    it("falls back to copying once the link arrives when it was not ready at click time", async () => {
      onPhone()
      let resolve: (value: ShareMemoryResult) => void = () => {}
      const share = asks(() => new Promise<ShareMemoryResult>((r) => (resolve = r)))
      render(<ShareButton memory={memory} share={share} />)
      fireEvent.click(screen.getByRole("button", { name: "Compartir" }))
      expect(webShare).not.toHaveBeenCalled()
      await act(async () => resolve({ ok: true, url: URL_SHARED }))
      expect(writeText).toHaveBeenCalledWith(URL_SHARED)
      expect(share).toHaveBeenCalledTimes(1)
      expect(screen.getByRole("status").textContent).toBe("Enlace copiado")
    })

    it("asks again at click time when the prefetch failed", async () => {
      onDesktop()
      const share = asks(async () => ({ ok: false, reason: "unavailable" }))
      render(<ShareButton memory={memory} share={share} />)
      await act(async () => {})
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Compartir" }))
      })
      expect(share).toHaveBeenCalledTimes(2)
    })
  })
})
