import { afterEach, describe, expect, it, vi } from "vitest"
import { OWNER_HANDLE, buildAccessRequest, copyToClipboard } from "./access-request"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("buildAccessRequest", () => {
  it("links to the owner's Instagram DM", () => {
    expect(OWNER_HANDLE).toBe("patriciopastor_")
    expect(buildAccessRequest("ana").href).toBe("https://ig.me/m/patriciopastor_")
  })

  it("puts the visitor's normalized handle in the message", () => {
    expect(buildAccessRequest(" @Ana.B ").message).toBe(
      "¡Hola! Me gustaría entrar a tu sitio. Mi Instagram es @ana.b.",
    )
  })
})

describe("copyToClipboard", () => {
  it("resolves true when the write succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    await expect(copyToClipboard("hi")).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith("hi")
  })

  it("resolves false when the write is rejected", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } })
    await expect(copyToClipboard("hi")).resolves.toBe(false)
  })

  it("resolves false when the write throws synchronously", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: () => {
          throw new Error("nope")
        },
      },
    })
    await expect(copyToClipboard("hi")).resolves.toBe(false)
  })

  it("resolves false when there is no clipboard", async () => {
    vi.stubGlobal("navigator", {})
    await expect(copyToClipboard("hi")).resolves.toBe(false)
  })
})
