import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  VOLUME_KEY,
  effectiveVolume,
  fillPercent,
  isTypingTarget,
  loadVolume,
  rememberVolume,
  saveVolume,
  scrubText,
  seekTarget,
  volumeText,
  wantsToggle,
} from "./player-model"

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
  }
}

describe("scrubText", () => {
  it("says where the voice is and how long it is, the way a screen reader should read it", () => {
    expect(scrubText(192, 932)).toBe("3:12 de 15:32")
    expect(scrubText(0, 65)).toBe("0:00 de 1:05")
  })

  it("reads an hour-long voice in minutes", () => {
    expect(scrubText(3599, 3600)).toBe("59:59 de 60:00")
  })

  it("never reads past the end or before the start", () => {
    expect(scrubText(5000, 932)).toBe("15:32 de 15:32")
    expect(scrubText(-4, 65)).toBe("0:00 de 1:05")
    expect(scrubText(Number.NaN, 65)).toBe("0:00 de 1:05")
  })
})

describe("seekTarget", () => {
  it("keeps a seek inside the voice", () => {
    expect(seekTarget(30, 120)).toBe(30)
    expect(seekTarget(-5, 120)).toBe(0)
    expect(seekTarget(500, 120)).toBe(120)
  })

  it("is the start for anything that is not a time", () => {
    expect(seekTarget(Number.NaN, 120)).toBe(0)
    expect(seekTarget(10, Number.NaN)).toBe(0)
  })
})

describe("fillPercent", () => {
  it("is how much of the track has played, as a percentage", () => {
    expect(fillPercent(0, 100)).toBe(0)
    expect(fillPercent(25, 100)).toBe(25)
    expect(fillPercent(100, 100)).toBe(100)
  })

  it("is 0 when the length is unknown, and never leaves 0..100", () => {
    expect(fillPercent(10, 0)).toBe(0)
    expect(fillPercent(10, Number.NaN)).toBe(0)
    expect(fillPercent(500, 100)).toBe(100)
    expect(fillPercent(-5, 100)).toBe(0)
  })
})

describe("effectiveVolume and volumeText", () => {
  it("is the volume, or silence while muted", () => {
    expect(effectiveVolume({ volume: 0.6, muted: false })).toBe(0.6)
    expect(effectiveVolume({ volume: 0.6, muted: true })).toBe(0)
  })

  it("reads as a percentage, and as muted when it is", () => {
    expect(volumeText({ volume: 0.7, muted: false })).toBe("70 %")
    expect(volumeText({ volume: 0.7, muted: true })).toBe("Silenciado")
    expect(volumeText({ volume: 0, muted: false })).toBe("Silenciado")
  })
})

describe("the remembered volume", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("starts at full volume when nothing is stored", () => {
    expect(loadVolume(memoryStorage())).toEqual({ volume: 1, muted: false })
  })

  it("keeps what it saved, under one key", () => {
    const storage = memoryStorage()
    saveVolume({ volume: 0.4, muted: true }, storage)
    expect(storage.setItem).toHaveBeenCalledWith(VOLUME_KEY, expect.any(String))
    expect(loadVolume(storage)).toEqual({ volume: 0.4, muted: true })
  })

  it("ignores what it cannot read: bad JSON, the wrong shape, out of range", () => {
    expect(loadVolume(memoryStorage({ [VOLUME_KEY]: "{nope" }))).toEqual({ volume: 1, muted: false })
    expect(loadVolume(memoryStorage({ [VOLUME_KEY]: JSON.stringify({ volume: "loud" }) }))).toEqual({ volume: 1, muted: false })
    expect(loadVolume(memoryStorage({ [VOLUME_KEY]: JSON.stringify({ volume: 9, muted: "yes" }) }))).toEqual({
      volume: 1,
      muted: false,
    })
  })

  it("does not break where storage is blocked or full", () => {
    const blocked = {
      getItem: vi.fn(() => {
        throw new Error("SecurityError")
      }),
      setItem: vi.fn(() => {
        throw new Error("QuotaExceededError")
      }),
    }
    expect(loadVolume(blocked)).toEqual({ volume: 1, muted: false })
    expect(() => saveVolume({ volume: 0.5, muted: false }, blocked)).not.toThrow()
  })

  it("holds it for the page session even when nothing can be stored", () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError")
      },
      setItem: () => {
        throw new Error("SecurityError")
      },
    }
    expect(rememberVolume(undefined, blocked)).toEqual({ volume: 1, muted: false })
    expect(rememberVolume({ volume: 0.3, muted: false }, blocked)).toEqual({ volume: 0.3, muted: false })
    expect(rememberVolume(undefined, blocked)).toEqual({ volume: 0.3, muted: false })
    rememberVolume({ volume: 1, muted: false }, blocked)
  })
})

describe("keyboard targets", () => {
  const el = (html: string) => {
    const host = document.createElement("div")
    host.innerHTML = html
    return host.firstElementChild as HTMLElement
  }

  it("knows where typing, or a slider, owns the keys", () => {
    expect(isTypingTarget(el(`<input type="text" />`))).toBe(true)
    expect(isTypingTarget(el(`<input type="range" />`))).toBe(true)
    expect(isTypingTarget(el(`<textarea></textarea>`))).toBe(true)
    expect(isTypingTarget(el(`<div role="slider" tabindex="0"></div>`))).toBe(true)
    expect(isTypingTarget(el(`<div contenteditable="true"></div>`))).toBe(true)
    expect(isTypingTarget(el(`<button type="button">x</button>`))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })

  it("toggles on Space and K, but never where typing or a slider owns the key", () => {
    const body = el(`<div></div>`)
    expect(wantsToggle({ key: " ", target: body })).toBe(true)
    expect(wantsToggle({ key: "k", target: body })).toBe(true)
    expect(wantsToggle({ key: "K", target: body })).toBe(true)
    expect(wantsToggle({ key: "Enter", target: body })).toBe(false)
    expect(wantsToggle({ key: " ", target: el(`<input type="range" />`) })).toBe(false)
    expect(wantsToggle({ key: "k", target: el(`<input type="text" />`) })).toBe(false)
  })

  it("leaves Space to a focused button or link (it presses that), but still lets K toggle", () => {
    const button = el(`<button type="button">Cerrar</button>`)
    expect(wantsToggle({ key: " ", target: button })).toBe(false)
    expect(wantsToggle({ key: "k", target: button })).toBe(true)
    expect(wantsToggle({ key: " ", target: el(`<a href="/">x</a>`) })).toBe(false)
  })

  it("leaves a key with a modifier alone (Ctrl+K, Alt+Space are the browser's)", () => {
    const body = el(`<div></div>`)
    expect(wantsToggle({ key: "k", target: body, ctrlKey: true })).toBe(false)
    expect(wantsToggle({ key: " ", target: body, metaKey: true })).toBe(false)
    expect(wantsToggle({ key: " ", target: body, altKey: true })).toBe(false)
  })
})
