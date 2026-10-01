import { describe, expect, it } from "vitest"
import { oklchToSrgb, toHex } from "@/features/orb/oklch"
import {
  DEFAULT_ORB_COLOR,
  GLOW_MIN_CHROMA,
  GLOW_MIN_LIGHTNESS,
  chooseOrbColor,
  colorDistance,
  colorName,
  glowColor,
  hexToOklch,
  isGlowColor,
  isHexColor,
  rimColor,
  swatchNames,
} from "./orb-color"

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

describe("hexToOklch", () => {
  it.each([
    ["#ffffff", 1, 0, undefined],
    ["#000000", 0, 0, undefined],
    ["#ff0000", 0.628, 0.258, 29.23],
    ["#0000ff", 0.452, 0.313, 264.05],
    ["#00ff00", 0.866, 0.295, 142.5],
  ])("reads %s as OKLCH (reference values)", (hex, l, c, h) => {
    const [L, C, H] = hexToOklch(hex)
    expect(L).toBeCloseTo(l, 2)
    expect(C).toBeCloseTo(c, 2)
    if (h !== undefined) expect(H).toBeCloseTo(h, 0)
  })
})

describe("isHexColor", () => {
  it.each(["#a58cff", "#A58CFF", "#000000"])("accepts %s", (value) => {
    expect(isHexColor(value)).toBe(true)
  })

  it.each(["a58cff", "#a58cf", "#a58cfff", "#abc", "#gggggg", "rgb(1,2,3)", "", null, undefined, 12, {}])(
    "rejects %s",
    (value) => {
      expect(isHexColor(value)).toBe(false)
    },
  )
})

describe("glowColor", () => {
  it("lifts a dark tone to glow on the void and keeps its hue", () => {
    const out = glowColor("#0a0f2a") // a dark navy, hue about 272
    const [l, c, h] = hexToOklch(out)
    expect(l).toBeGreaterThanOrEqual(GLOW_MIN_LIGHTNESS - 0.01)
    expect(c).toBeGreaterThanOrEqual(GLOW_MIN_CHROMA - 0.01)
    expect(hueGap(h, 272)).toBeLessThan(8)
  })

  it("adds chroma to a washed-out tone without moving its hue", () => {
    const out = glowColor("#9aa0a6") // light enough, nearly grey, hue about 248
    const [l, c, h] = hexToOklch(out)
    expect(l).toBeGreaterThanOrEqual(GLOW_MIN_LIGHTNESS - 0.01)
    expect(c).toBeGreaterThanOrEqual(GLOW_MIN_CHROMA - 0.01)
    expect(hueGap(h, 248)).toBeLessThan(10)
  })

  it("leaves a tone that already glows almost untouched", () => {
    for (const hex of ["#8ab4ff", "#ff9a3c", "#4fd1b9", "#e88ad6"]) {
      expect(colorDistance(glowColor(hex), hex)).toBeLessThan(0.02)
    }
  })

  it("gives black and pure greys a cool hue instead of an invented warm one", () => {
    for (const hex of ["#000000", "#ffffff", "#808080"]) {
      const [l, c, h] = hexToOklch(glowColor(hex))
      expect(l).toBeGreaterThanOrEqual(GLOW_MIN_LIGHTNESS - 0.01)
      expect(c).toBeGreaterThanOrEqual(GLOW_MIN_CHROMA - 0.01)
      expect(h).toBeGreaterThan(200)
      expect(h).toBeLessThan(300)
    }
  })

  it("does not blow out a very light tone: it keeps room for color", () => {
    const [l, c] = hexToOklch(glowColor("#fff8d0"))
    expect(l).toBeLessThanOrEqual(0.87)
    expect(c).toBeGreaterThanOrEqual(GLOW_MIN_CHROMA - 0.01)
  })

  it("maps out-of-gamut results back into sRGB by lowering chroma, not by shifting the hue", () => {
    // Pure blue at its lifted lightness has no room for its chroma in sRGB: a plain clamp would drift toward purple or cyan.
    const [, , h] = hexToOklch(glowColor("#0000ff"))
    expect(hueGap(h, 264)).toBeLessThan(6)
    // Pure red and green too.
    expect(hueGap(hexToOklch(glowColor("#ff0000"))[2], 29)).toBeLessThan(6)
    expect(hueGap(hexToOklch(glowColor("#00ff00"))[2], 142)).toBeLessThan(6)
  })

  it("always answers a lowercase #rrggbb that passes the glow floor, for any hue, lightness and chroma", () => {
    for (let hue = 0; hue < 360; hue += 7) {
      for (const l of [0.1, 0.3, 0.5, 0.7, 0.9, 0.98]) {
        for (const c of [0.01, 0.06, 0.12, 0.3]) {
          const source = toHex(oklchToSrgb(l, c, hue))
          const out = glowColor(source)
          expect(out).toMatch(/^#[0-9a-f]{6}$/)
          expect(isGlowColor(out), `${source} -> ${out}`).toBe(true)
          // A tone with real chroma keeps its hue (quantization to 8 bits allows a few degrees).
          const [, sourceChroma, sourceHue] = hexToOklch(source)
          if (sourceChroma >= 0.05) expect(hueGap(hexToOklch(out)[2], sourceHue)).toBeLessThan(8)
        }
      }
    }
  })

  it("passes the glow floor for every 8-bit grey and a coarse grid of the RGB cube", () => {
    const hex = (n: number) => n.toString(16).padStart(2, "0")
    for (let v = 0; v < 256; v += 5) expect(isGlowColor(glowColor(`#${hex(v)}${hex(v)}${hex(v)}`))).toBe(true)
    for (let r = 0; r < 256; r += 51) {
      for (let g = 0; g < 256; g += 51) {
        for (let b = 0; b < 256; b += 51) {
          const out = glowColor(`#${hex(r)}${hex(g)}${hex(b)}`)
          expect(isGlowColor(out), out).toBe(true)
        }
      }
    }
  })

  it("is idempotent: a glowing color stays the same", () => {
    for (const hex of ["#0a0f2a", "#ffffff", "#0000ff", "#ffe14d"]) {
      const once = glowColor(hex)
      expect(glowColor(once)).toBe(once)
    }
  })

  it("accepts uppercase and answers lowercase", () => {
    expect(glowColor("#8AB4FF")).toBe(glowColor("#8ab4ff"))
  })
})

describe("isGlowColor", () => {
  it("accepts what glowColor makes, and the default", () => {
    expect(isGlowColor(glowColor("#112233"))).toBe(true)
    expect(isGlowColor(DEFAULT_ORB_COLOR)).toBe(true)
    expect(isGlowColor("#8ab4ff")).toBe(true)
  })

  it.each([
    ["too dark", "#112233"],
    ["black", "#000000"],
    ["white (no chroma)", "#ffffff"],
    ["a grey", "#b0b0b0"],
    ["a muddy mid-tone", "#6b5a78"],
    ["not a hex", "red"],
    ["a short hex", "#8af"],
    ["not a string", 12],
    ["null", null],
  ])("rejects %s", (_name, value) => {
    expect(isGlowColor(value)).toBe(false)
  })
})

describe("the default orb color", () => {
  it("is a cool tone that glows", () => {
    const [l, c, h] = hexToOklch(DEFAULT_ORB_COLOR)
    expect(isGlowColor(DEFAULT_ORB_COLOR)).toBe(true)
    expect(l).toBeGreaterThanOrEqual(GLOW_MIN_LIGHTNESS)
    expect(c).toBeGreaterThanOrEqual(GLOW_MIN_CHROMA)
    expect(h).toBeGreaterThan(200)
    expect(h).toBeLessThan(300)
  })
})

describe("chooseOrbColor (the server's fallback chain)", () => {
  it("takes the visitor's color when it is valid and glows, lowercased", () => {
    expect(chooseOrbColor("#FF9A3C", "#112233")).toBe("#ff9a3c")
    expect(chooseOrbColor("#a58cff", null)).toBe("#a58cff")
  })

  it.each([
    ["too dark for the void", "#112233"],
    ["not a hex", "orange"],
    ["a short hex", "#fa3"],
    ["not a string", 42],
    ["an object", { color: "#ff9a3c" }],
    ["missing", undefined],
    ["null", null],
  ])("falls back to the photo's dominant color, adjusted to glow, when the color is %s", (_name, requested) => {
    const picked = chooseOrbColor(requested, "#0a0f2a")
    expect(picked).toBe(glowColor("#0a0f2a"))
    expect(isGlowColor(picked)).toBe(true)
  })

  it("falls back to the default cool tone when there is no usable dominant color either", () => {
    expect(chooseOrbColor(undefined, null)).toBe(DEFAULT_ORB_COLOR)
    expect(chooseOrbColor("nope", "also nope")).toBe(DEFAULT_ORB_COLOR)
    expect(chooseOrbColor(null, "")).toBe(DEFAULT_ORB_COLOR)
  })

  it("always answers a color that passes the floor", () => {
    for (const requested of ["#000000", "#ffffff", "#8ab4ff", "x", undefined]) {
      for (const dominant of ["#000000", "#ffffff", "#f0a", null]) {
        expect(isGlowColor(chooseOrbColor(requested, dominant))).toBe(true)
      }
    }
  })
})

describe("colorName", () => {
  it.each([
    ["#ff9a3c", "naranja"],
    ["#a58cff", "violeta"],
    ["#4fd1b9", "verde azulado"],
    ["#8fe08a", "verde"],
    ["#ff7a7a", "rojo"],
    ["#e88ad6", "fucsia"],
    ["#8ab4ff", "azul"],
  ])("calls %s %s", (hex, name) => {
    expect(colorName(hex)).toBe(name)
  })

  it("lets lightness decide between neighbours: pink vs red, sky blue vs blue", () => {
    expect(colorName("#ff8fb1")).toBe("rosa")
    expect(colorName("#8ec5ff")).toBe("celeste")
    expect(colorName("#6fd6ff")).toBe("celeste")
  })

  it("adds claro for a very light tone", () => {
    expect(colorName("#ffe14d")).toBe("amarillo claro")
    expect(colorName("#c8f060")).toBe("verde lima claro")
  })

  it("is plain lowercase Spanish: no voseo, no hex, no digits", () => {
    for (let hue = 0; hue < 360; hue += 5) {
      const name = colorName(toHex(oklchToSrgb(0.75, 0.12, hue)))
      expect(name).toMatch(/^[a-záéíóúñ ]+$/)
    }
  })
})

describe("swatchNames", () => {
  it("names every swatch, and keeps the names distinct so each can be told apart by ear", () => {
    const names = swatchNames(["#ff9a3c", "#ffa24a", "#a58cff", "#ffb35c", "#4fd1b9"])
    expect(names).toEqual(["naranja", "naranja 2", "violeta", "naranja 3", "verde azulado"])
    expect(new Set(names).size).toBe(names.length)
  })

  it("leaves distinct names alone", () => {
    expect(swatchNames(["#ff9a3c", "#a58cff"])).toEqual(["naranja", "violeta"])
  })
})

describe("rimColor", () => {
  it("is the neighbouring hue of the orb's color, and glows too", () => {
    const base = "#8ab4ff"
    const rim = rimColor(base)
    expect(isGlowColor(rim)).toBe(true)
    const gap = hueGap(hexToOklch(rim)[2], hexToOklch(base)[2])
    expect(gap).toBeGreaterThan(15)
    expect(gap).toBeLessThan(45)
  })
})

describe("colorDistance", () => {
  it("is zero for the same color, symmetric, and grows with the difference", () => {
    expect(colorDistance("#8ab4ff", "#8ab4ff")).toBe(0)
    expect(colorDistance("#8ab4ff", "#ff9a3c")).toBeCloseTo(colorDistance("#ff9a3c", "#8ab4ff"), 10)
    expect(colorDistance("#8ab4ff", "#8cb5ff")).toBeLessThan(colorDistance("#8ab4ff", "#a58cff"))
  })
})
