import { afterEach, describe, expect, it, vi } from "vitest"
import { GAMBARINO_CSS, ensureGambarinoStylesheet, fontReadyOrTimeout } from "./font"

afterEach(() => {
  vi.useRealTimers()
  document.head.innerHTML = ""
})

describe("fontReadyOrTimeout", () => {
  it("resolves ready as soon as the font is", async () => {
    await expect(fontReadyOrTimeout(() => Promise.resolve(), 800)).resolves.toBe("ready")
  })

  it("gives up after the cap when the font never arrives", async () => {
    vi.useFakeTimers()
    const result = fontReadyOrTimeout(() => new Promise(() => {}), 800)
    await vi.advanceTimersByTimeAsync(799)
    let settled = false
    void result.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toBe("timeout")
  })

  it("treats a failing load as a timeout, never a throw", async () => {
    await expect(fontReadyOrTimeout(() => Promise.reject(new Error("offline")), 800)).resolves.toBe("timeout")
  })

  it("clears its timer once the font wins", async () => {
    vi.useFakeTimers()
    await fontReadyOrTimeout(() => Promise.resolve(), 800)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("ensureGambarinoStylesheet", () => {
  it("injects the Fontshare stylesheet once, deduped by id", () => {
    const a = ensureGambarinoStylesheet()
    const b = ensureGambarinoStylesheet()
    expect(a).toBe(b)
    const links = document.head.querySelectorAll('link[rel="stylesheet"]')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute("href")).toBe(GAMBARINO_CSS)
  })
})
